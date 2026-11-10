import os

files = {
    "src/types/ble.ts": '''export const BLE_CONFIG = {
  SERVICE_UUID: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
  DISPENSE_CHAR_UUID: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
  TELEMETRY_CHAR_UUID: '13187b10-80a2-4a00-a2ef-98844e135540',
  STALE_WEIGHT_TIMEOUT_MS: 5000,
  ACK_TIMEOUT_MS: 10000,
} as const;

export enum DispensingState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  READY = 'READY',
  COMMAND_PENDING = 'COMMAND_PENDING',
  DISPENSING = 'DISPENSING',
  DISPENSING_SEQUENCE_COMPLETED = 'DISPENSING_SEQUENCE_COMPLETED',
  OUTCOME_UNKNOWN = 'OUTCOME_UNKNOWN',
  ERROR = 'ERROR'
}

export enum EventType {
  COMMAND_RECEIVED = 'COMMAND_RECEIVED',
  DISPENSE_SEQUENCE_COMPLETED = 'DISPENSE_SEQUENCE_COMPLETED',
  WEIGHT_UPDATED = 'WEIGHT_UPDATED',
  UNCOLLECTED_DOSE_ALERT = 'UNCOLLECTED_DOSE_ALERT',
  DEVICE_ERROR = 'DEVICE_ERROR',
  UNKNOWN_MESSAGE = 'UNKNOWN_MESSAGE'
}

export type DeviceErrorType = 'DISPENSE_BUSY' | 'INVALID_COMPARTMENT' | 'SCALE_NOT_READY' | 'UNKNOWN_ERROR';

export interface TelemetryEvent {
  type: EventType;
  deviceId: string;
  rawMessage: string;
  timestamp: number;
  isValid: boolean;
  compartmentIndex?: number;
  displayedCompartment?: number;
  weightGrams?: number;
  errorType?: DeviceErrorType;
}

export interface DeviceState {
  id: string;
  name: string;
  isCompatible: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected';
  dispensingState: DispensingState;
  latestWeightGrams: number | null;
  lastWeightTimestamp: number | null;
  pendingCompartment: number | null;
  lastAckTimestamp: number | null;
  lastError: string | null;
  hasUncollectedDoseAlert: boolean;
  uncollectedAlertTimestamp: number | null;
  gattDevice?: BluetoothDevice;
  server?: BluetoothRemoteGATTServer;
  dispenseChar?: BluetoothRemoteGATTCharacteristic;
  telemetryChar?: BluetoothRemoteGATTCharacteristic;
}

export type DeviceStateChangeListener = (devices: Map<string, DeviceState>, activeDeviceId: string | null) => void;
export type TelemetryEventListener = (event: TelemetryEvent) => void;
''',

    "src/services/bleProtocol.ts": '''import { BLE_CONFIG, EventType, TelemetryEvent, DeviceErrorType } from '../types/ble';

export class BLEProtocol {
  public static encodeDispenseCommand(displayedCompartment: number): Uint8Array {
    if (!Number.isInteger(displayedCompartment)) {
      throw new Error(`Invalid compartment: ${displayedCompartment}. Must be an integer.`);
    }
    if (displayedCompartment < 1 || displayedCompartment > 13) {
      throw new Error(`Compartment ${displayedCompartment} out of range (1..13).`);
    }

    const firmwareIndex = displayedCompartment - 1;
    const payloadString = firmwareIndex.toString(10);
    const encoder = new TextEncoder();
    return encoder.encode(payloadString);
  }

  public static parseTelemetry(
    deviceId: string,
    rawBytes: DataView,
    receiptTimestamp: number = Date.now()
  ): TelemetryEvent {
    const decoder = new TextDecoder('utf-8');
    const rawMessage = decoder.decode(rawBytes).trim();

    const baseEvent = {
      deviceId,
      rawMessage,
      timestamp: receiptTimestamp,
      isValid: true,
    };

    if (rawMessage.startsWith('ACK:RECEIVED:')) {
      const indexStr = rawMessage.replace('ACK:RECEIVED:', '');
      const fwIndex = parseInt(indexStr, 10);
      if (isNaN(fwIndex) || fwIndex < 0 || fwIndex > 12) {
        return { ...baseEvent, type: EventType.UNKNOWN_MESSAGE, isValid: false };
      }
      return { ...baseEvent, type: EventType.COMMAND_RECEIVED, compartmentIndex: fwIndex, displayedCompartment: fwIndex + 1 };
    }

    if (rawMessage.startsWith('ACK:DISPENSED:')) {
      const indexStr = rawMessage.replace('ACK:DISPENSED:', '');
      const fwIndex = parseInt(indexStr, 10);
      if (isNaN(fwIndex) || fwIndex < 0 || fwIndex > 12) {
        return { ...baseEvent, type: EventType.UNKNOWN_MESSAGE, isValid: false };
      }
      return { ...baseEvent, type: EventType.DISPENSE_SEQUENCE_COMPLETED, compartmentIndex: fwIndex, displayedCompartment: fwIndex + 1 };
    }

    if (rawMessage.startsWith('WEIGHT:') && rawMessage.endsWith('g')) {
      const weightStr = rawMessage.substring(7, rawMessage.length - 1);
      const val = parseFloat(weightStr);
      if (isNaN(val) || !isFinite(val) || val < 0) {
        return { ...baseEvent, type: EventType.UNKNOWN_MESSAGE, isValid: false };
      }
      return { ...baseEvent, type: EventType.WEIGHT_UPDATED, weightGrams: val };
    }

    if (rawMessage === 'ALARM:CAREGIVER_ALERT:UNCOLLECTED_DOSE') {
      return { ...baseEvent, type: EventType.UNCOLLECTED_DOSE_ALERT };
    }

    if (rawMessage.startsWith('ERROR:')) {
      let errorType: DeviceErrorType = 'UNKNOWN_ERROR';
      if (rawMessage === 'ERROR:DISPENSE_BUSY') errorType = 'DISPENSE_BUSY';
      else if (rawMessage === 'ERROR:INVALID_COMPARTMENT') errorType = 'INVALID_COMPARTMENT';
      else if (rawMessage === 'ERROR:SCALE_NOT_READY') errorType = 'SCALE_NOT_READY';

      return { ...baseEvent, type: EventType.DEVICE_ERROR, errorType };
    }

    return { ...baseEvent, type: EventType.UNKNOWN_MESSAGE, isValid: false };
  }
}
''',

    "src/services/bleManager.ts": '''import {
  BLE_CONFIG,
  DeviceState,
  DispensingState,
  EventType,
  TelemetryEvent,
  DeviceStateChangeListener,
  TelemetryEventListener,
} from '../types/ble';
import { BLEProtocol } from './bleProtocol';

export class BLEManager {
  private static instance: BLEManager;
  private devices: Map<string, DeviceState> = new Map();
  private activeDeviceId: string | null = null;
  private stateListeners: Set<DeviceStateChangeListener> = new Set();
  private telemetryListeners: Set<TelemetryEventListener> = new Set();
  private pendingAckTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {}

  public static getInstance(): BLEManager {
    if (!BLEManager.instance) {
      BLEManager.instance = new BLEManager();
    }
    return BLEManager.instance;
  }

  public subscribeState(listener: DeviceStateChangeListener): () => void {
    this.stateListeners.add(listener);
    listener(new Map(this.devices), this.activeDeviceId);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeTelemetry(listener: TelemetryEventListener): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  private notifyStateChange() {
    const copy = new Map(this.devices);
    this.stateListeners.forEach((listener) => listener(copy, this.activeDeviceId));
  }

  private notifyTelemetry(event: TelemetryEvent) {
    this.telemetryListeners.forEach((listener) => listener(event));
  }

  public async discoverDevices(): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth is not supported in this browser.');
    }

    try {
      const gattDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE_CONFIG.SERVICE_UUID] }],
        optionalServices: [BLE_CONFIG.SERVICE_UUID],
      });

      this.registerDiscoveredDevice(gattDevice);
    } catch (err: any) {
      if (err.name === 'NotFoundError') return;
      throw err;
    }
  }

  private registerDiscoveredDevice(gattDevice: BluetoothDevice) {
    const id = gattDevice.id;
    const name = gattDevice.name || `DC-PROTO-${id.slice(0, 4).toUpperCase()}`;

    let state = this.devices.get(id);
    if (!state) {
      state = {
        id,
        name,
        isCompatible: true,
        connectionState: 'disconnected',
        dispensingState: DispensingState.DISCONNECTED,
        latestWeightGrams: null,
        lastWeightTimestamp: null,
        pendingCompartment: null,
        lastAckTimestamp: null,
        lastError: null,
        hasUncollectedDoseAlert: false,
        uncollectedAlertTimestamp: null,
        gattDevice,
      };
      this.devices.set(id, state);
    } else {
      state.gattDevice = gattDevice;
      state.name = name;
    }

    if (!this.activeDeviceId) {
      this.activeDeviceId = id;
    }

    gattDevice.addEventListener('gattserverdisconnected', () => this.handleDisconnection(id));
    this.notifyStateChange();
  }

  public setActiveDevice(deviceId: string): void {
    const active = this.getActiveDeviceState();
    if (active && active.dispensingState === DispensingState.COMMAND_PENDING) {
      throw new Error('Cannot switch devices while a dispensing operation is pending.');
    }

    if (!this.devices.has(deviceId)) {
      throw new Error(`Device ID ${deviceId} is not registered.`);
    }

    this.activeDeviceId = deviceId;
    this.notifyStateChange();
  }

  public getActiveDeviceState(): DeviceState | null {
    if (!this.activeDeviceId) return null;
    return this.devices.get(this.activeDeviceId) || null;
  }

  public async connectDevice(deviceId: string): Promise<void> {
    const deviceState = this.devices.get(deviceId);
    if (!deviceState || !deviceState.gattDevice) {
      throw new Error('Device unavailable for connection.');
    }

    deviceState.connectionState = 'connecting';
    deviceState.dispensingState = DispensingState.CONNECTING;
    deviceState.lastError = null;
    this.notifyStateChange();

    try {
      const server = await deviceState.gattDevice.gatt?.connect();
      if (!server) throw new Error('Failed to establish GATT connection.');

      deviceState.server = server;
      const service = await server.getPrimaryService(BLE_CONFIG.SERVICE_UUID);

      let dispenseChar: BluetoothRemoteGATTCharacteristic;
      let telemetryChar: BluetoothRemoteGATTCharacteristic;

      try {
        dispenseChar = await service.getCharacteristic(BLE_CONFIG.DISPENSE_CHAR_UUID);
        telemetryChar = await service.getCharacteristic(BLE_CONFIG.TELEMETRY_CHAR_UUID);
      } catch (charError) {
        deviceState.isCompatible = false;
        deviceState.connectionState = 'disconnected';
        deviceState.dispensingState = DispensingState.ERROR;
        deviceState.lastError = 'Incompatible device: Missing required BLE characteristics.';
        this.notifyStateChange();
        return;
      }

      deviceState.dispenseChar = dispenseChar;
      deviceState.telemetryChar = telemetryChar;
      deviceState.isCompatible = true;

      await telemetryChar.startNotifications();
      telemetryChar.addEventListener('characteristicvaluechanged', (evt: Event) => {
        const target = evt.target as BluetoothRemoteGATTCharacteristic;
        if (target.value) {
          this.handleIncomingTelemetry(deviceId, target.value);
        }
      });

      deviceState.connectionState = 'connected';
      deviceState.dispensingState = DispensingState.READY;
      this.notifyStateChange();
    } catch (err: any) {
      deviceState.connectionState = 'disconnected';
      deviceState.dispensingState = DispensingState.ERROR;
      deviceState.lastError = err.message || 'Connection failed.';
      this.notifyStateChange();
      throw err;
    }
  }

  public async disconnectDevice(deviceId: string): Promise<void> {
    const deviceState = this.devices.get(deviceId);
    if (!deviceState) return;

    if (this.pendingAckTimers.has(deviceId)) {
      clearTimeout(this.pendingAckTimers.get(deviceId)!);
      this.pendingAckTimers.delete(deviceId);
    }

    if (deviceState.telemetryChar) {
      try { await deviceState.telemetryChar.stopNotifications(); } catch (e) {}
    }

    if (deviceState.server && deviceState.server.connected) {
      deviceState.server.disconnect();
    }

    this.handleDisconnection(deviceId);
  }

  private handleDisconnection(deviceId: string) {
    const deviceState = this.devices.get(deviceId);
    if (!deviceState) return;

    const hadPendingCommand = deviceState.dispensingState === DispensingState.COMMAND_PENDING ||
                               deviceState.dispensingState === DispensingState.DISPENSING;

    deviceState.connectionState = 'disconnected';
    deviceState.dispensingState = hadPendingCommand ? DispensingState.OUTCOME_UNKNOWN : DispensingState.DISCONNECTED;
    deviceState.server = undefined;
    deviceState.dispenseChar = undefined;
    deviceState.telemetryChar = undefined;

    this.notifyStateChange();
  }

  public async sendDispenseCommand(displayedCompartment: number): Promise<void> {
    const deviceState = this.getActiveDeviceState();
    if (!deviceState) throw new Error('No active device selected.');
    if (!deviceState.isCompatible) throw new Error('Selected device is incompatible.');
    if (deviceState.connectionState !== 'connected' || !deviceState.dispenseChar) throw new Error('Active device is not connected.');
    if (deviceState.dispensingState === DispensingState.COMMAND_PENDING || deviceState.dispensingState === DispensingState.DISPENSING) {
      throw new Error('A dispensing command is already pending on this device.');
    }

    const payloadBytes = BLEProtocol.encodeDispenseCommand(displayedCompartment);

    deviceState.dispensingState = DispensingState.COMMAND_PENDING;
    deviceState.pendingCompartment = displayedCompartment;
    deviceState.lastError = null;
    this.notifyStateChange();

    try {
      await deviceState.dispenseChar.writeValue(payloadBytes);

      const timeout = setTimeout(() => {
        if (deviceState.dispensingState === DispensingState.COMMAND_PENDING) {
          deviceState.dispensingState = DispensingState.OUTCOME_UNKNOWN;
          deviceState.lastError = 'Acknowledgement timeout.';
          this.notifyStateChange();
        }
      }, BLE_CONFIG.ACK_TIMEOUT_MS);

      this.pendingAckTimers.set(deviceState.id, timeout);
    } catch (err: any) {
      deviceState.dispensingState = DispensingState.ERROR;
      deviceState.pendingCompartment = null;
      deviceState.lastError = `BLE write failed: ${err.message}`;
      this.notifyStateChange();
      throw err;
    }
  }

  private handleIncomingTelemetry(deviceId: string, dataView: DataView) {
    const deviceState = this.devices.get(deviceId);
    if (!deviceState) return;

    const event = BLEProtocol.parseTelemetry(deviceId, dataView);
    this.notifyTelemetry(event);

    if (!event.isValid) return;

    switch (event.type) {
      case EventType.COMMAND_RECEIVED:
        if (this.pendingAckTimers.has(deviceId)) {
          clearTimeout(this.pendingAckTimers.get(deviceId)!);
          this.pendingAckTimers.delete(deviceId);
        }
        deviceState.dispensingState = DispensingState.DISPENSING;
        deviceState.lastAckTimestamp = event.timestamp;
        break;

      case EventType.DISPENSE_SEQUENCE_COMPLETED:
        deviceState.dispensingState = DispensingState.DISPENSING_SEQUENCE_COMPLETED;
        deviceState.pendingCompartment = null;
        deviceState.lastAckTimestamp = event.timestamp;
        setTimeout(() => {
          if (deviceState.dispensingState === DispensingState.DISPENSING_SEQUENCE_COMPLETED) {
            deviceState.dispensingState = DispensingState.READY;
            this.notifyStateChange();
          }
        }, 3000);
        break;

      case EventType.WEIGHT_UPDATED:
        if (event.weightGrams !== undefined) {
          deviceState.latestWeightGrams = event.weightGrams;
          deviceState.lastWeightTimestamp = event.timestamp;
        }
        break;

      case EventType.UNCOLLECTED_DOSE_ALERT:
        deviceState.hasUncollectedDoseAlert = true;
        deviceState.uncollectedAlertTimestamp = event.timestamp;
        break;

      case EventType.DEVICE_ERROR:
        if (this.pendingAckTimers.has(deviceId)) {
          clearTimeout(this.pendingAckTimers.get(deviceId)!);
          this.pendingAckTimers.delete(deviceId);
        }
        deviceState.dispensingState = DispensingState.ERROR;
        deviceState.pendingCompartment = null;
        deviceState.lastError = `Device error: ${event.errorType}`;
        break;
    }

    this.notifyStateChange();
  }

  public clearUncollectedAlert(deviceId: string): void {
    const deviceState = this.devices.get(deviceId);
    if (deviceState) {
      deviceState.hasUncollectedDoseAlert = false;
      this.notifyStateChange();
    }
  }
}
''',

    "src/components/DeviceManager.tsx": '''import React, { useEffect, useState } from 'react';
import { BLEManager } from '../services/bleManager';
import { DeviceState } from '../types/ble';

export const DeviceManager: React.FC = () => {
  const bleManager = BLEManager.getInstance();
  const [devicesMap, setDevicesMap] = useState<Map<string, DeviceState>>(new Map());
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = bleManager.subscribeState((devices, activeId) => {
      setDevicesMap(devices);
      setActiveDeviceId(activeId);
    });
    return () => unsubscribe();
  }, []);

  const handleScan = async () => {
    setErrorMsg(null);
    try {
      await bleManager.discoverDevices();
    } catch (err: any) {
      setErrorMsg(err.message || 'Discovery failed.');
    }
  };

  const handleConnect = async (id: string) => {
    setErrorMsg(null);
    try {
      await bleManager.connectDevice(id);
    } catch (err: any) {
      setErrorMsg(`Connection error: ${err.message}`);
    }
  };

  const handleDisconnect = async (id: string) => {
    await bleManager.disconnectDevice(id);
  };

  const handleSelectActive = (id: string) => {
    try {
      bleManager.setActiveDevice(id);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const devicesList = Array.from(devicesMap.values());
  const activeDevice = activeDeviceId ? devicesMap.get(activeDeviceId) : null;

  return (
    <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', marginBottom: '1rem' }}>
      <h2>DoseCompass Prototype Management</h2>
      <button onClick={handleScan} style={{ padding: '0.5rem 1rem', fontWeight: 'bold' }}>
        Discover DoseCompass Devices
      </button>

      {errorMsg && <div style={{ color: 'red', marginTop: '0.5rem' }}>{errorMsg}</div>}

      <div style={{ marginTop: '1rem' }}>
        <h3>Discovered Devices</h3>
        {devicesList.length === 0 ? (
          <p>No BLE devices discovered. Click scan to search for DoseCompass prototypes.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '8px' }}>Active</th>
                <th style={{ padding: '8px' }}>BLE Device Name</th>
                <th style={{ padding: '8px' }}>Device ID</th>
                <th style={{ padding: '8px' }}>Compatibility</th>
                <th style={{ padding: '8px' }}>Status</th>
                <th style={{ padding: '8px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {devicesList.map((dev) => {
                const isSelected = dev.id === activeDeviceId;
                return (
                  <tr key={dev.id} style={{ borderBottom: '1px solid #eee', backgroundColor: isSelected ? '#f0f8ff' : 'transparent' }}>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="radio"
                        name="activeDevice"
                        checked={isSelected}
                        onChange={() => handleSelectActive(dev.id)}
                      />
                    </td>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{dev.name}</td>
                    <td style={{ padding: '8px', fontSize: '0.85rem' }}>{dev.id}</td>
                    <td style={{ padding: '8px' }}>
                      {dev.isCompatible ? (
                        <span style={{ color: 'green', fontWeight: 'bold' }}>✓ Compatible Profile</span>
                      ) : (
                        <span style={{ color: 'red', fontWeight: 'bold' }}>✗ Missing Characteristics</span>
                      )}
                    </td>
                    <td style={{ padding: '8px' }}>{dev.connectionState.toUpperCase()}</td>
                    <td style={{ padding: '8px' }}>
                      {dev.connectionState === 'disconnected' ? (
                        <button onClick={() => handleConnect(dev.id)} disabled={!dev.isCompatible}>
                          Connect
                        </button>
                      ) : (
                        <button onClick={() => handleDisconnect(dev.id)}>Disconnect</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {activeDevice && (
        <div style={{ marginTop: '1rem', background: '#eef6ff', padding: '0.75rem', borderRadius: '4px' }}>
          <strong>Currently Active Target Dispenser:</strong> {activeDevice.name} ({activeDevice.id})
          <br />
          <strong>GATT Telemetry State:</strong> {activeDevice.dispensingState}
        </div>
      )}
    </div>
  );
};
''',

    "src/components/DispenserControl.tsx": '''import React, { useEffect, useState } from 'react';
import { BLEManager } from '../services/bleManager';
import { DeviceState, DispensingState, BLE_CONFIG } from '../types/ble';

export const DispenserControl: React.FC = () => {
  const bleManager = BLEManager.getInstance();
  const [activeDevice, setActiveDevice] = useState<DeviceState | null>(null);
  const [selectedCompartment, setSelectedCompartment] = useState<number>(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const unsubscribe = bleManager.subscribeState((devices, activeId) => {
      if (activeId && devices.has(activeId)) {
        setActiveDevice(devices.get(activeId)!);
      } else {
        setActiveDevice(null);
      }
    });

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  const handleDispense = async () => {
    setActionError(null);
    if (!activeDevice) {
      setActionError('No active dispenser selected.');
      return;
    }

    try {
      await bleManager.sendDispenseCommand(selectedCompartment);
    } catch (err: any) {
      setActionError(err.message || 'Dispensing request failed.');
    }
  };

  const isStaleWeight = activeDevice?.lastWeightTimestamp 
    ? (now - activeDevice.lastWeightTimestamp) > BLE_CONFIG.STALE_WEIGHT_TIMEOUT_MS 
    : true;

  const canDispense = activeDevice && 
    activeDevice.isCompatible && 
    activeDevice.connectionState === 'connected' && 
    (activeDevice.dispensingState === DispensingState.READY || activeDevice.dispensingState === DispensingState.DISPENSING_SEQUENCE_COMPLETED);

  return (
    <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', marginBottom: '1rem' }}>
      <h2>Dispense Operation Panel</h2>

      {!activeDevice ? (
        <p>Select and connect a compatible DoseCompass prototype to operate the dispenser.</p>
      ) : (
        <div>
          <div style={{ marginBottom: '1rem', padding: '0.5rem', borderLeft: '4px solid #0066cc', background: '#f4f8fc' }}>
            <div><strong>Selected Prototype:</strong> {activeDevice.name}</div>
            <div><strong>Status:</strong> {activeDevice.dispensingState}</div>
            <div>
              <strong>Live Telemetry Weight:</strong>{' '}
              {activeDevice.latestWeightGrams !== null && !isStaleWeight ? (
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#008000' }}>
                  {activeDevice.latestWeightGrams.toFixed(2)}g
                </span>
              ) : (
                <span style={{ color: '#888' }}>
                  {activeDevice.latestWeightGrams !== null ? `${activeDevice.latestWeightGrams.toFixed(2)}g (STALE)` : 'Unavailable'}
                </span>
              )}
            </div>
          </div>

          <h3>Select Compartment (1 to 13)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', marginBottom: '1rem' }}>
            {Array.from({ length: 13 }, (_, i) => i + 1).map((compNum) => (
              <button
                key={compNum}
                onClick={() => setSelectedCompartment(compNum)}
                style={{
                  padding: '10px',
                  backgroundColor: selectedCompartment === compNum ? '#0066cc' : '#f0f0f0',
                  color: selectedCompartment === compNum ? '#fff' : '#000',
                  fontWeight: 'bold',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Comp {compNum}
              </button>
            ))}
          </div>

          <div style={{ background: '#eee', padding: '0.5rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Command Preview: Displayed Compartment <strong>{selectedCompartment}</strong> ➔ Transmitted Zero-Based UTF-8 Payload: <strong>"{selectedCompartment - 1}"</strong>
          </div>

          <button
            onClick={handleDispense}
            disabled={!canDispense}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              backgroundColor: canDispense ? '#28a745' : '#cccccc',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: canDispense ? 'pointer' : 'not-allowed',
            }}
          >
            {activeDevice.dispensingState === DispensingState.COMMAND_PENDING
              ? 'Sending Command...'
              : activeDevice.dispensingState === DispensingState.DISPENSING
              ? 'Servo Dispensing in Progress...'
              : `Trigger Dispense for Compartment ${selectedCompartment}`}
          </button>

          {actionError && <div style={{ color: 'red', marginTop: '0.5rem', fontWeight: 'bold' }}>{actionError}</div>}
          {activeDevice.lastError && (
            <div style={{ color: 'darkred', marginTop: '0.5rem' }}>Device Alert: {activeDevice.lastError}</div>
          )}
        </div>
      )}
    </div>
  );
};
''',

    "src/components/CaregiverDashboard.tsx": '''import React, { useEffect, useState } from 'react';
import { BLEManager } from '../services/bleManager';
import { DeviceState, TelemetryEvent, EventType } from '../types/ble';

export const CaregiverDashboard: React.FC = () => {
  const bleManager = BLEManager.getInstance();
  const [devicesMap, setDevicesMap] = useState<Map<string, DeviceState>>(new Map());
  const [alertLogs, setAlertLogs] = useState<TelemetryEvent[]>([]);

  useEffect(() => {
    const unsubscribeState = bleManager.subscribeState((devices) => {
      setDevicesMap(devices);
    });

    const unsubscribeTelemetry = bleManager.subscribeTelemetry((event) => {
      if (event.type === EventType.UNCOLLECTED_DOSE_ALERT || event.type === EventType.DEVICE_ERROR) {
        setAlertLogs((prev) => [event, ...prev].slice(0, 20));
      }
    });

    return () => {
      unsubscribeState();
      unsubscribeTelemetry();
    };
  }, []);

  const devices = Array.from(devicesMap.values());
  const uncollectedAlertDevices = devices.filter((d) => d.hasUncollectedDoseAlert);

  return (
    <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h2>Caregiver Telemetry & Uncollected Dose Dashboard</h2>

      {uncollectedAlertDevices.length > 0 && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffeeba', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
          <h3 style={{ color: '#856404', marginTop: 0 }}>🚨 Active Caregiver Alerts (Uncollected Dose)</h3>
          {uncollectedAlertDevices.map((dev) => (
            <div key={dev.id} style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>{dev.name}</strong> detected weight &gt; 0.50g after 30 minutes!
              </span>
              <button onClick={() => bleManager.clearUncollectedAlert(dev.id)}>Acknowledge Alert</button>
            </div>
          ))}
        </div>
      )}

      <h3>Telemetry Log</h3>
      {alertLogs.length === 0 ? (
        <p>No critical events or alarms reported.</p>
      ) : (
        <ul style={{ paddingLeft: '1.2rem' }}>
          {alertLogs.map((log, idx) => (
            <li key={idx}>
              [{new Date(log.timestamp).toLocaleTimeString()}] Device <strong>{log.deviceId}</strong>: {log.rawMessage}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
''',

    "src/tests/bleProtocol.test.ts": '''import { BLEProtocol } from '../services/bleProtocol';
import { EventType } from '../types/ble';

describe('DoseCompass BLE Protocol Unit Tests', () => {
  describe('Outbound Command Formatting', () => {
    test('Correctly maps 1-based UI compartments 1..13 to zero-based UTF-8 byte payloads "0".."12"', () => {
      const decoder = new TextDecoder();
      expect(decoder.decode(BLEProtocol.encodeDispenseCommand(1))).toBe('0');
      expect(decoder.decode(BLEProtocol.encodeDispenseCommand(2))).toBe('1');
      expect(decoder.decode(BLEProtocol.encodeDispenseCommand(5))).toBe('4');
      expect(decoder.decode(BLEProtocol.encodeDispenseCommand(10))).toBe('9');
      expect(decoder.decode(BLEProtocol.encodeDispenseCommand(13))).toBe('12');
    });

    test('Rejects invalid compartment selections outside 1..13', () => {
      expect(() => BLEProtocol.encodeDispenseCommand(0)).toThrow();
      expect(() => BLEProtocol.encodeDispenseCommand(14)).toThrow();
      expect(() => BLEProtocol.encodeDispenseCommand(-1)).toThrow();
      expect(() => BLEProtocol.encodeDispenseCommand(3.14)).toThrow();
    });
  });

  describe('Inbound Telemetry Parsing', () => {
    const encoder = new TextEncoder();
    const parseHelper = (str: string) => {
      const bytes = encoder.encode(str);
      const dataView = new DataView(bytes.buffer);
      return BLEProtocol.parseTelemetry('DEV-01', dataView, 1000);
    };

    test('Parses ACK:RECEIVED:<index>', () => {
      const event = parseHelper('ACK:RECEIVED:4');
      expect(event.type).toBe(EventType.COMMAND_RECEIVED);
      expect(event.compartmentIndex).toBe(4);
      expect(event.displayedCompartment).toBe(5);
    });

    test('Parses ACK:DISPENSED:<index>', () => {
      const event = parseHelper('ACK:DISPENSED:4');
      expect(event.type).toBe(EventType.DISPENSE_SEQUENCE_COMPLETED);
      expect(event.compartmentIndex).toBe(4);
      expect(event.displayedCompartment).toBe(5);
    });

    test('Parses WEIGHT:<value>g readings', () => {
      expect(parseHelper('WEIGHT:0.00g').weightGrams).toBe(0.0);
      expect(parseHelper('WEIGHT:0.45g').weightGrams).toBe(0.45);
      expect(parseHelper('WEIGHT:1.25g').weightGrams).toBe(1.25);
    });

    test('Parses Caregiver Uncollected Dose Alarm', () => {
      const event = parseHelper('ALARM:CAREGIVER_ALERT:UNCOLLECTED_DOSE');
      expect(event.type).toBe(EventType.UNCOLLECTED_DOSE_ALERT);
    });

    test('Parses Device Errors', () => {
      expect(parseHelper('ERROR:DISPENSE_BUSY').errorType).toBe('DISPENSE_BUSY');
    });
  });
});
'''
}

for path, content in files.items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Updated: {path}")
print("\nSuccess! All DoseCompass BLE files have been created/updated.")