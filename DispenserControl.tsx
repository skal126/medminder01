import React, { useEffect, useState } from 'react';
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
