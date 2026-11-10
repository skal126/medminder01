import React, { useEffect, useState } from 'react';
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
