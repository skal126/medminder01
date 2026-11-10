import React, { useEffect, useState } from 'react';
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
