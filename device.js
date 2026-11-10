// ConnectionManager — the single place that talks to the physical dispenser.
//
// It owns the live transports and exposes one small event API:
//   - mqtt : long range, over secure WebSocket, via a broker
//   - ble  : short range, Web Bluetooth
//
// Emits: 'state' (connectivity changed), 'log' (diagnostic line),
//        'telemetry' (device state snapshot), 'event' (discrete device event),
//        'status' (online/offline from MQTT last-will).

import {
  BLE,
  BLE_SIGNAL,
  ble,
  parseBleSignal,
  DEFAULT_BROKER,
  DEFAULT_PING_URL,
  topics,
  makeCommand,
  encode,
  decode,
} from './protocol';

const MAX_LOGS = 200;

const listeners = new Map();
function on(evt, cb) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(cb);
  return () => off(evt, cb);
}
function off(evt, cb) {
  listeners.get(evt)?.delete(cb);
}
function emit(evt, data) {
  listeners.get(evt)?.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error('[device] listener error', e);
    }
  });
}

let state = {
  mode: null, // 'mqtt' | 'ble'
  broker: DEFAULT_BROKER,
  pingUrl: DEFAULT_PING_URL,
  mqttConnected: false,
  bleConnected: false,
  bleDevice: null, // { id, name }
  bleTelemetry: null, // last status notification (parsed)
  bleLastEvent: null, // last event code seen on the status characteristic
  bleWeight: null, // last "WEIGHT:X.Xg" reading from the load cell
  bleLastSignal: null, // last parsed inbound line (debug)
  bleAutoReconnect: true,
  bleReconnecting: false,
  bleReconnectAttempt: 0,
  bleSupported: typeof navigator !== 'undefined' && !!navigator.bluetooth,
  serverReachable: null, // null = unknown, true/false after a ping
  lastPingAt: null,
  deviceId: null,
  logs: [],
};

function setState(patch) {
  state = { ...state, ...patch };
  emit('state', state);
}
function log(line, level = 'info') {
  const entry = { t: Date.now(), line, level };
  setState({ logs: [entry, ...state.logs].slice(0, MAX_LOGS) });
  emit('log', entry);
}

// ------------------------------ MQTT (long range) ------------------------------

let client = null;

export function configure({ broker, pingUrl } = {}) {
  if (broker) setState({ broker });
  if (pingUrl) setState({ pingUrl });
}

export async function connectMqtt(deviceId) {
  disconnect();
  const t = topics(deviceId);
  setState({ mode: 'mqtt', deviceId });
  log(`Connecting to broker ${state.broker} for ${deviceId}…`);

  let mqtt;
  try {
    ({ default: mqtt } = await import('mqtt'));
  } catch (e) {
    log(`MQTT library failed to load: ${e.message}`, 'error');
    return;
  }

  try {
    client = mqtt.connect(state.broker, {
      clientId: `dc-app-${deviceId}-${Math.random().toString(16).slice(2, 8)}`,
      clean: true,
      connectTimeout: 8000,
      reconnectPeriod: 4000,
      keepalive: 30,
      protocolVersion: 5,
    });
  } catch (e) {
    log(`MQTT connect failed: ${e.message}`, 'error');
    setState({ mqttConnected: false });
    return;
  }

  client.on('connect', () => {
    setState({ mqttConnected: true, serverReachable: true });
    log(`MQTT connected. Subscribing to ${t.base}/#`);
    client.subscribe([t.telemetry, t.event, t.status, t.ack], { qos: 0 });
  });
  client.on('reconnect', () => log('MQTT reconnecting…', 'warn'));
  client.on('close', () => {
    setState({ mqttConnected: false });
    log('MQTT closed', 'warn');
  });
  client.on('error', (err) => {
    setState({ mqttConnected: false });
    log(`MQTT error: ${err.message}`, 'error');
  });
  client.on('message', (topic, payload) => {
    const obj = decode(payload);
    if (!obj) return;
    if (topic === t.telemetry) {
      log('telemetry ← device');
      emit('telemetry', obj);
    } else if (topic === t.event) {
      log(`event ← ${obj.type}`);
      emit('event', obj);
    } else if (topic === t.status) {
      const s = typeof payload === 'string' ? payload : payload.toString();
      log(`status ← ${s}`);
      emit('status', s);
    } else if (topic === t.ack) {
      log('ack ← device');
      emit('ack', obj);
    }
  });
}

function disconnectMqtt() {
  if (client) {
    try {
      client.end(true);
    } catch {
      /* ignore */
    }
    client = null;
  }
  setState({ mqttConnected: false });
}

// ------------------------------ BLE (short range) ------------------------------
//
// Works with every "DC-PROTO-xx" dispenser model:
//   - DISPENSE: write a plain UTF-8 compartment index ("0"…"11") to the command
//     characteristic (no JSON, no binary framing).
//   - Other control commands: compact flat JSON ({"cmd":...}).
//   - Inbound: line-delimited text signals streamed on the telemetry
//     characteristic — "WEIGHT:12.4g", "ACK:DISPENSED:0", "ERROR:HX711" — plus
//     the legacy JSON status object, which is still accepted.

let bleServer = null;
let bleCmdChar = null;
let bleStatusChar = null;
let bleTarget = null;
let bleOnNotify = null;
let bleOnDisconnect = null;
let bleDeviceRef = null;
let bleRxBuffer = '';
const bleDecoder = new TextDecoder();
const bleEncoder = new TextEncoder();

let reconnectTimer = null;
let reconnectAttempt = 0;
let manualDisconnect = false;
const RECONNECT_MAX_ATTEMPTS = 12;

export const bleSupported = () => state.bleSupported;

// Must be called from a user gesture (button click).
export async function scanBle() {
  if (!state.bleSupported) {
    throw new Error('Web Bluetooth is not supported in this browser. Use Chrome or Edge on desktop/Android.');
  }
  log('Scanning for BLE dispensers (DC-PROTO-xx)…');

  const options = {
    filters: [{ services: [BLE.SERVICE] }],
    optionalServices: [BLE.SERVICE],
  };

  const device = await navigator.bluetooth.requestDevice(options);

  log(`Found BLE device: ${device.name || device.id}`);
  return { id: device.id, name: device.name || device.id, raw: device };
}

function rawLog(dir, text) {
  emit('ble-raw', { dir, text, ts: Date.now() });
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function applyBleTelemetry(t) {
  const patch = { bleTelemetry: t };
  if (typeof t.weight === 'number') patch.bleWeight = t.weight;
  if (t.event) {
    patch.bleLastEvent = t.event;
    log(`event ← ${t.event}`);
  }
  setState(patch);
  emit('ble-telemetry', t);
}

function handleBleLine(line) {
  const sig = parseBleSignal(line);
  if (!sig) return;
  setState({ bleLastSignal: sig });
  log(`ble ← ${sig.raw}`, sig.kind === BLE_SIGNAL.ERROR ? 'error' : 'info');

  if (sig.kind === BLE_SIGNAL.WEIGHT) {
    setState({ bleWeight: sig.weightG });
  } else if (sig.kind === BLE_SIGNAL.TELEMETRY) {
    applyBleTelemetry(sig.telemetry);
  }

  emit('ble-signal', sig);
}

// Notifications arrive in MTU-sized chunks; reassemble complete lines before
// parsing so a signal split across two packets still parses correctly.
function drainBleBuffer() {
  let nl;
  while ((nl = bleRxBuffer.indexOf('\n')) >= 0) {
    const line = bleRxBuffer.slice(0, nl).replace(/\r$/, '').trim();
    bleRxBuffer = bleRxBuffer.slice(nl + 1);
    if (line) handleBleLine(line);
  }

  const pending = bleRxBuffer.trim();
  if (!pending) return;

  if (pending.startsWith('{')) {
    if (safeParse(pending)) {
      bleRxBuffer = '';
      handleBleLine(pending);
    }
    return;
  }

  const complete = /^(WEIGHT\s*:\s*-?\d+(?:\.\d+)?\s*g?|ACK\s*:\s*[A-Z_]+(?:\s*:\s*-?\d+)?|ERROR\s*:\s*.+)$/i.test(pending);
  if (complete) {
    bleRxBuffer = '';
    handleBleLine(pending);
  }
}

function ingestBleChunk(value) {
  const text = bleDecoder.decode(value, { stream: true });
  if (!text) return;
  rawLog('in', text);
  bleRxBuffer += text;
  drainBleBuffer();
}

async function getStatusCharacteristic(service) {
  return service.getCharacteristic(BLE.STATUS_CHAR);
}

export async function connectBle(deviceOrRef, opts = {}) {
  if (!deviceOrRef) throw new Error('No BLE device selected.');
  const device = deviceOrRef.raw || deviceOrRef;

  manualDisconnect = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  log(`${opts.isReconnect ? 'Reconnecting' : 'Connecting'} BLE to ${device.name || device.id}…`);

  if (!opts.isReconnect) {
    disconnectMqtt();
  }

  try {
    bleServer = await device.gatt.connect();
    bleTarget = device;
    bleDeviceRef = device;

    const service = await bleServer.getPrimaryService(BLE.SERVICE);
    bleCmdChar = await service.getCharacteristic(BLE.CMD_CHAR);
    bleStatusChar = await getStatusCharacteristic(service);

    if (!bleCmdChar.properties?.write && !bleCmdChar.properties?.writeWithoutResponse) {
      throw new Error('Dispense characteristic does not support WRITE.');
    }
    if (!bleStatusChar.properties?.read || !bleStatusChar.properties?.notify) {
      throw new Error('Telemetry characteristic must support READ and NOTIFY.');
    }

    // Enable CCCD notifications and attach the stream listener.
    await bleStatusChar.startNotifications();
    bleOnNotify = (e) => ingestBleChunk(e.target.value);
    if (bleStatusChar.addEventListener) {
      bleStatusChar.addEventListener('characteristicvaluechanged', bleOnNotify);
    } else {
      bleStatusChar.oncharacteristicvaluechanged = bleOnNotify;
    }

    // Drop handling → automatic reconnect with exponential backoff.
    bleOnDisconnect = () => {
      log('BLE link lost', 'warn');
      resetBle({ keepDevice: true });
      scheduleReconnect();
    };
    device.addEventListener?.('gattserverdisconnected', bleOnDisconnect);

    reconnectAttempt = 0;
    bleRxBuffer = '';
    setState({
      bleConnected: true,
      bleReconnecting: false,
      bleReconnectAttempt: 0,
      bleDevice: { id: device.id, name: device.name || device.id },
      mode: 'ble',
    });
    log(`BLE connected to ${device.name || device.id}`);

    // Best-effort: read the current status, then ask for a fresh snapshot.
    try {
      ingestBleChunk(await bleStatusChar.readValue());
    } catch {
      /* characteristic may be notify-only */
    }
    try {
      await sendBle(ble.getStatus());
    } catch {
      /* ignore */
    }
    return true;
  } catch (e) {
    resetBle({ keepDevice: true });
    setState({ bleConnected: false });
    throw e;
  }
}

function resetBle({ keepDevice = false } = {}) {
  if (bleStatusChar && bleOnNotify) {
    try {
      if (bleStatusChar.removeEventListener) {
        bleStatusChar.removeEventListener('characteristicvaluechanged', bleOnNotify);
      } else {
        bleStatusChar.oncharacteristicvaluechanged = null;
      }
    } catch {
      /* ignore */
    }
  }
  bleServer = null;
  bleCmdChar = null;
  bleStatusChar = null;
  bleOnNotify = null;
  bleOnDisconnect = null;
  bleRxBuffer = '';
  if (!keepDevice) {
    bleTarget = null;
    bleDeviceRef = null;
  }
  setState({
    bleConnected: false,
    bleDevice: keepDevice ? state.bleDevice : null,
    bleTelemetry: null,
    bleLastEvent: null,
  });
}

function disconnectBle() {
  manualDisconnect = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
  try {
    if (bleTarget && bleOnDisconnect) bleTarget.removeEventListener?.('gattserverdisconnected', bleOnDisconnect);
  } catch {
    /* ignore */
  }
  try {
    if (bleServer && bleServer.connected) bleServer.disconnect();
  } catch {
    /* ignore */
  }
  resetBle();
  setState({ bleReconnecting: false, bleReconnectAttempt: 0, bleWeight: null });
}

function scheduleReconnect() {
  if (manualDisconnect) return;

  if (!state.bleAutoReconnect || !bleDeviceRef) {
    setState({ bleReconnecting: false });
    return;
  }
  if (reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
    log('BLE auto-reconnect gave up — tap Scan & Connect again', 'error');
    setState({ bleReconnecting: false });
    return;
  }

  const delay = Math.min(30000, 1000 * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  setState({ bleReconnecting: true, bleReconnectAttempt: reconnectAttempt });
  log(`BLE reconnect in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempt}/${RECONNECT_MAX_ATTEMPTS})`, 'warn');

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (manualDisconnect || !bleDeviceRef) return;
    try {
      await connectBle(bleDeviceRef, { isReconnect: true });
      log('BLE auto-reconnected', 'info');
    } catch (e) {
      log(`BLE reconnect failed: ${e.message}`, 'warn');
      scheduleReconnect();
    }
  }, delay);
}

export function setBleAutoReconnect(enabled) {
  setState({ bleAutoReconnect: !!enabled });
  if (!enabled) {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    setState({ bleReconnecting: false });
  } else if (!state.bleConnected && bleDeviceRef) {
    scheduleReconnect();
  }
}

export function reconnectBleNow() {
  if (!bleDeviceRef) throw new Error('No BLE device to reconnect to — scan first.');
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  manualDisconnect = false;
  reconnectAttempt = 0;
  return connectBle(bleDeviceRef, { isReconnect: true });
}

// Write raw text to the command characteristic in MTU-safe chunks.
async function writeBle(text) {
  if (!bleCmdChar) throw new Error('Not connected via Bluetooth.');
  const data = bleEncoder.encode(text);
  rawLog('out', text);
  const CHUNK = 20; // safe default ATT payload (MTU 23)
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    try {
      if (bleCmdChar.writeValueWithoutResponse) await bleCmdChar.writeValueWithoutResponse(slice);
      else if (bleCmdChar.writeValueWithResponse) await bleCmdChar.writeValueWithResponse(slice);
      else await bleCmdChar.writeValue(slice);
    } catch (e) {
      log(`BLE write failed: ${e.message}`, 'error');
      throw e;
    }
  }
}

// Send a JSON BLE control command. Returns the object that was sent.
export async function sendBle(commandObj) {
  if (!state.bleConnected) throw new Error('Not connected via Bluetooth.');
  await writeBle(JSON.stringify(commandObj));
  log(`cmd → ${commandObj?.cmd || 'cmd'} (ble)`, 'info');
  return commandObj;
}

// Send a plain UTF-8 string (used by DISPENSE, which is not JSON).
export async function sendBleText(text, label = 'text') {
  if (!state.bleConnected) throw new Error('Not connected via Bluetooth.');
  const payload = String(text);
  await writeBle(payload);
  log(`cmd → ${label} "${payload}" (ble)`, 'info');
  return payload;
}

// Dispense from a 0-indexed tube by writing the plain index string.
export function sendBleDispense(tube) {
  const payload = ble.dispensePayload(tube);
  return sendBleText(payload, `DISPENSE tube ${payload}`);
}

// ------------------------------ Server ping ------------------------------

export async function pingServer(url) {
  const target = url || state.pingUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    await fetch(target, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    setState({ serverReachable: true, lastPingAt: Date.now() });
    log('Server ping OK');
    return true;
  } catch (e) {
    setState({ serverReachable: false, lastPingAt: Date.now() });
    log(`Server ping failed: ${e.message}`, 'error');
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------ Command routing ------------------------------

const CRITICAL = new Set([
  'dispense',
  'drop_replacement',
  'pause',
  'resume',
  'refill',
  'clear_clog',
  'pair',
  'unpair',
]);

export function isCritical(type) {
  return CRITICAL.has(type);
}

export async function sendCommand(type, payload = {}) {
  const cmd = makeCommand(type, payload);

  if (state.mode === 'ble' && state.bleConnected) {
    if (type === 'dispense' || type === 'drop_replacement') {
      // Firmware expects the plain compartment index, not JSON.
      await sendBleDispense((payload.comp ?? 1) - 1);
      emit('ack', { ...cmd, transport: 'ble' });
      return { ok: true, transport: 'ble', cmd };
    }
    const bleObj = toBleCommand(type, payload);
    if (!bleObj) {
      log(`cmd ✗ ${type} is not supported over BLE`, 'warn');
      return { ok: false, transport: 'ble', cmd };
    }
    await sendBle(bleObj);
    emit('ack', { ...cmd, transport: 'ble' });
    return { ok: true, transport: 'ble', cmd };
  }

  if (state.mode === 'ble' && !state.bleConnected) {
    log(`cmd ✗ ${type} — Bluetooth disconnected`, 'warn');
    return { ok: false, transport: 'ble', cmd, reason: 'disconnected' };
  }

  if (state.mode === 'mqtt' && client && state.mqttConnected && state.deviceId) {
    const t = topics(state.deviceId);
    client.publish(t.cmd, encode(cmd), { qos: 1 });
    log(`cmd → ${type} (mqtt)`);
    return { ok: true, transport: 'mqtt', cmd };
  }

  log(`cmd ✗ ${type} — no live transport connected`, 'warn');
  return { ok: false, transport: 'none', cmd, reason: 'disconnected' };
}

// Map an internal command onto the compact BLE vocabulary. Returns null when a
// command has no BLE equivalent (the caller then skips the over-the-air write).
function toBleCommand(type, payload = {}) {
  switch (type) {
    case 'dispense':
      return ble.dispense((payload.comp ?? 1) - 1, payload.dose ?? 1);
    case 'drop_replacement':
      return ble.dispense((payload.comp ?? 1) - 1, 1);
    case 'pause':
      return ble.pause();
    case 'resume':
      return ble.resume();
    case 'get_status':
      return ble.getStatus();
    case 'tare':
      return ble.tare();
    case 'set_time':
      return ble.setTime(payload.hour ?? 0, payload.min ?? 0, payload.sec ?? 0);
    case 'set_delay':
      return ble.setDelay(payload.delay_ms ?? 1000);
    case 'set_schedule':
      return ble.setSchedule(
        payload.idx ?? 0,
        payload.tube ?? 0,
        payload.hour ?? 0,
        payload.min ?? 0,
        payload.count ?? 1,
        payload.active ?? true,
      );
    default:
      return null;
  }
}

// ------------------------------ Lifecycle ------------------------------

export function disconnect() {
  disconnectMqtt();
  disconnectBle();
  setState({ mode: null, mqttConnected: false, bleConnected: false, bleDevice: null });
}

export function attach(deviceId) {
  setState({ deviceId });
}

export function getState() {
  return state;
}

export const device = {
  on,
  off,
  configure,
  connectMqtt,
  disconnect,
  scanBle,
  connectBle,
  sendBle,
  sendBleText,
  sendBleDispense,
  bleSupported,
  setBleAutoReconnect,
  reconnectBleNow,
  pingServer,
  sendCommand,
  isCritical,
  attach,
  getState,
};
