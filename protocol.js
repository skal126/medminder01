// Device protocol for the DoseCompass Smart Pill Dispenser prototype.
//
// Two transports, one command/telemetry contract:
//
//  1. LONG RANGE  ->  MQTT over secure WebSocket (WSS)
//        ESP32/Arduino  --WiFi-->  MQTT broker  --WSS-->  this web app
//      The prototype connects outbound to a broker (no public IP or port
//      forwarding needed). The web app subscribes over WSS. This works from
//      anywhere in the world as long as both have internet.
//
//  2. SHORT RANGE ->  Bluetooth Low Energy (BLE)
//      A custom dosecompass GATT service (write + notify). Carries a compact
//      flat JSON contract ({"cmd":...} out, telemetry fields in) for nearby
//      discovery, first-time provisioning and direct local control.
//
// MQTT uses the rich {id,type,ts,payload} envelope; BLE uses the compact
// {"cmd":...} contract. See docs/device-protocol.md for both firmware contracts.

// BLE is a DISTINCT contract from MQTT. The dispenser exposes one service
// with a write characteristic (commands) and a notify/read characteristic
// (telemetry).
export const BLE = {
  SERVICE: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
  CMD_CHAR: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
  STATUS_CHAR: '13187b10-80a2-4a00-a2ef-98844e135540',
};

// Inbound text-protocol signals the firmware streams on the status
// characteristic, e.g. "WEIGHT:12.4g", "ACK:DISPENSED:0", "ERROR:HX711".
export const BLE_SIGNAL = {
  TELEMETRY: 'telemetry', // legacy JSON status object
  WEIGHT: 'weight',
  ACK: 'ack',
  ERROR: 'error',
  UNKNOWN: 'unknown',
  ALERT: 'alert',
};

// Compact BLE command vocabulary (the "cmd" field of every payload).
export const BLE_CMD = {
  DISPENSE: 'DISPENSE',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  SET_DELAY: 'SET_DELAY',
  SET_TIME: 'SET_TIME',
  SET_SCHEDULE: 'SET_SCHEDULE',
  TARE_DISH: 'TARE_DISH',
  GET_STATUS: 'GET_STATUS',
};

// Asynchronous event codes the device may push on the status characteristic.
export const BLE_EVENT = {
  PILL_DETECTED_IN_DISH: 'PILL_DETECTED_IN_DISH',
  DISH_CLEARED: 'DISH_CLEARED',
  DISPENSE_SUCCESS: 'DISPENSE_SUCCESS',
  DISPENSE_ERROR: 'DISPENSE_ERROR',
  BATTERY_UPDATE: 'BATTERY_UPDATE',
  CONNECTED: 'CONNECTED',
};

// Number of physical tubes/compartment carousels (0-indexed on the wire).
export const BLE_TUBE_COUNT = 13;

export const BLE_TELEMETRY_KEYS = ['event', 'battery', 'online', 'paused', 'pill_in_dish', 'time'];

export const compartmentToFirmwareIndex = (compartment) => {
  if (typeof compartment !== 'number' || !Number.isInteger(compartment)) {
    throw new TypeError('Compartment must be an integer.');
  }
  if (compartment < 1 || compartment > BLE_TUBE_COUNT) {
    throw new RangeError('Compartment must be between 1 and 13.');
  }
  return compartment - 1;
};

export const compartmentToBlePayload = (compartment) =>
  String(compartmentToFirmwareIndex(compartment));

export const parseBleTelemetry = (raw, sourceDeviceId, receiptTime = Date.now()) => {
  const text = bleText(raw).trim();
  const base = {
    sourceDeviceId,
    originalMessage: text,
    receiptTime,
    valid: false,
  };
  if (!text) return { ...base, type: 'UNKNOWN_MESSAGE' };

  let match = /^ACK:RECEIVED:(\d{1,2})$/.exec(text);
  if (match) {
    const index = Number(match[1]);
    if (index < 0 || index > 12) return { ...base, type: 'UNKNOWN_MESSAGE' };
    return { ...base, type: 'COMMAND_RECEIVED', index, valid: true };
  }

  match = /^ACK:DISPENSED:(\d{1,2})$/.exec(text);
  if (match) {
    const index = Number(match[1]);
    if (index < 0 || index > 12) return { ...base, type: 'UNKNOWN_MESSAGE' };
    return { ...base, type: 'DISPENSE_SEQUENCE_COMPLETED', index, valid: true };
  }

  match = /^WEIGHT:([+-]?(?:\d+(?:\.\d*)?|\.\d+))g$/.exec(text);
  if (match) {
    const weight = Number(match[1]);
    if (!Number.isFinite(weight) || weight < 0) return { ...base, type: 'UNKNOWN_MESSAGE' };
    return { ...base, type: 'WEIGHT_UPDATED', weight, valid: true };
  }

  if (text === 'ALARM:CAREGIVER_ALERT') {
    return { ...base, type: 'UNCOLLECTED_DOSE_ALERT', valid: true };
  }
  if (text === 'ERROR') {
    return { ...base, type: 'DEVICE_ERROR', error: 'DEVICE_ERROR', valid: true };
  }
  return { ...base, type: 'UNKNOWN_MESSAGE' };
};

// Default public broker for the prototype. Swap for your own in Settings.
export const DEFAULT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
export const DEFAULT_PING_URL = 'https://broker.emqx.io/status';

export const TOPIC_ROOT = 'dosecompass';

export function topics(deviceId) {
  const base = `${TOPIC_ROOT}/${deviceId}`;
  return {
    base,
    cmd: `${base}/cmd`,
    ack: `${base}/cmd_ack`,
    telemetry: `${base}/telemetry`,
    event: `${base}/event`,
    status: `${base}/status`, // device LWT publishes "online"/"offline"
  };
}

export const CMD = {
  PING: 'ping',
  DISPENSE: 'dispense',
  DROP_REPLACEMENT: 'drop_replacement',
  PAUSE: 'pause',
  RESUME: 'resume',
  REFILL: 'refill',
  CLEAR_CLOG: 'clear_clog',
  SYNC_SCHEDULE: 'sync_schedule',
  UNPAIR: 'unpair',
  SET_TIMEZONE: 'set_timezone',
};

export const EVENT = {
  TAKEN: 'medication_taken',
  DISPENSED: 'pill_dispensed',
  MISSED: 'missed_dose',
  PAUSED: 'system_paused',
  SUPPRESSED: 'dose_suppressed',
  REPLACEMENT: 'replacement_drop',
  FOREIGN: 'foreign_object',
  CLOG: 'tube_clog',
  REFILL: 'refill_recorded',
  CONNECTION_LOST: 'connection_lost',
  INTERLOCK: 'safety_interlock',
  RESUMED: 'schedule_resumed',
};

export const DISH = {
  EMPTY: 'EMPTY',
  MEDICATION_PRESENT: 'MEDICATION_PRESENT',
  FOREIGN_OBJECT: 'FOREIGN_OBJECT',
};

// ------------------------------ BLE command builders ------------------------------
// Each returns the exact JSON object written to the command characteristic.
//
//   {"cmd":"DISPENSE","tube":0,"count":1}
//   {"cmd":"PAUSE"} / {"cmd":"RESUME"}
//   {"cmd":"SET_DELAY","delay_ms":1000}
//   {"cmd":"SET_TIME","hour":14,"min":30,"sec":0}
//   {"cmd":"SET_SCHEDULE","idx":0,"tube":1,"hour":8,"min":0,"count":1,"active":true}
//   {"cmd":"TARE_DISH"} / {"cmd":"GET_STATUS"}

export const ble = {
  // DISPENSE is the zero-based firmware index as a plain UTF-8 string.
  dispensePayload: (firmwareIndex) => {
    if (typeof firmwareIndex !== 'number' || !Number.isInteger(firmwareIndex) || firmwareIndex < 0 || firmwareIndex > 12) {
      throw new RangeError('Firmware index must be an integer between 0 and 12.');
    }
    return String(firmwareIndex);
  },
  dispense: (tube, count = 1) => ({ cmd: BLE_CMD.DISPENSE, tube: clampTube(tube), count }),
  pause: () => ({ cmd: BLE_CMD.PAUSE }),
  resume: () => ({ cmd: BLE_CMD.RESUME }),
  setDelay: (delayMs) => ({ cmd: BLE_CMD.SET_DELAY, delay_ms: Math.max(0, Math.round(delayMs)) }),
  setTime: (hour, min, sec = 0) => ({
    cmd: BLE_CMD.SET_TIME,
    hour: clampInt(hour, 0, 23),
    min: clampInt(min, 0, 59),
    sec: clampInt(sec, 0, 59),
  }),
  setSchedule: (idx, tube, hour, min, count = 1, active = true) => ({
    cmd: BLE_CMD.SET_SCHEDULE,
    idx: clampInt(idx, 0, BLE_TUBE_COUNT - 1),
    tube: clampTube(tube),
    hour: clampInt(hour, 0, 23),
    min: clampInt(min, 0, 59),
    count: Math.max(1, Math.round(count)),
    active: !!active,
  }),
  tare: () => ({ cmd: BLE_CMD.TARE_DISH }),
  getStatus: () => ({ cmd: BLE_CMD.GET_STATUS }),
};

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
function clampTube(tube) {
  return clampInt(tube, 0, BLE_TUBE_COUNT - 1);
}

export function bleText(raw) {
  if (typeof raw === 'string') return raw;
  try {
    return new TextDecoder().decode(raw);
  } catch {
    return '';
  }
}

export function parseBleSignal(raw) {
  const event = parseBleTelemetry(raw);
  if (!event.valid) return { kind: BLE_SIGNAL.UNKNOWN, raw: bleText(raw).trim() };
  switch (event.type) {
    case 'COMMAND_RECEIVED':
      return { kind: BLE_SIGNAL.ACK, action: 'RECEIVED', tube: event.index, ok: true, raw: event.originalMessage };
    case 'DISPENSE_SEQUENCE_COMPLETED':
      return { kind: BLE_SIGNAL.ACK, action: 'DISPENSED', tube: event.index, ok: true, raw: event.originalMessage };
    case 'WEIGHT_UPDATED':
      return { kind: BLE_SIGNAL.WEIGHT, weightG: event.weight, raw: event.originalMessage };
    case 'UNCOLLECTED_DOSE_ALERT':
      return { kind: BLE_SIGNAL.ALERT, raw: event.originalMessage };
    case 'DEVICE_ERROR':
      return { kind: BLE_SIGNAL.ERROR, code: 'DEVICE_ERROR', raw: event.originalMessage };
    default:
      return { kind: BLE_SIGNAL.UNKNOWN, raw: event.originalMessage };
  }
}

let seq = 0;
export function makeCommand(type, payload = {}) {
  seq += 1;
  return {
    id: `${Date.now()}-${seq}`,
    type,
    ts: new Date().toISOString(),
    payload,
  };
}

export function encode(obj) {
  return JSON.stringify(obj);
}

export function decode(raw) {
  try {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    return JSON.parse(text);
  } catch {
    return null;
  }
}
