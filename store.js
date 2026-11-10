// DoseCompass central store.
// In production this talks to Supabase; today it persists to localStorage so the
// whole portal is real and stateful. Every hardware command flows through the
// device manager so the exact same code drives the physical prototype.

import { useSyncExternalStore } from 'react';
import { device } from './device';
import { EVENT, DISH, BLE_EVENT, BLE_SIGNAL, ble as bleCmd } from './protocol';
import { toast } from './toast';

const STORAGE_KEY = 'dosecompass.v3';

export const DISH_STATES = DISH;

// ---- Event catalogue (label + colour tone) ----
export const EVENT_META = {
  [EVENT.TAKEN]: { label: 'Medication Taken', tone: 'success' },
  [EVENT.DISPENSED]: { label: 'Pill Dispensed', tone: 'info' },
  [EVENT.MISSED]: { label: 'Missed Dose', tone: 'critical' },
  [EVENT.PAUSED]: { label: 'System Paused', tone: 'warn' },
  [EVENT.SUPPRESSED]: { label: 'Dose Suppressed', tone: 'warn' },
  [EVENT.REPLACEMENT]: { label: 'Replacement Drop', tone: 'override' },
  [EVENT.FOREIGN]: { label: 'Foreign Object', tone: 'warn' },
  [EVENT.CLOG]: { label: 'Tube Clog', tone: 'critical' },
  [EVENT.REFILL]: { label: 'Refill Recorded', tone: 'success' },
  [EVENT.CONNECTION_LOST]: { label: 'Connection Lost', tone: 'critical' },
  [EVENT.INTERLOCK]: { label: 'Safety Interlock Active', tone: 'critical' },
  [EVENT.RESUMED]: { label: 'Schedule Resumed', tone: 'info' },
};

export function eventMeta(type) {
  return EVENT_META[type] || { label: type, tone: 'info' };
}

// ---- Compartments ----
// A compartment can hold several doses per day at different times, so the
// schedule is a list: [{ time:'08:00', dose:1, active:true }, ...]. The legacy
// single `time`/`dose`/`scheduleActive` fields are kept in sync for older
// screens and for saved state from previous builds.
const DEFAULT_TIME = '08:00';

export function normalizeSchedules(input, legacy = {}) {
  const list = Array.isArray(input) ? input : [];
  const clean = list
    .filter((s) => s && typeof s.time === 'string' && /^\d{2}:\d{2}$/.test(s.time.slice(0, 5)))
    .map((s) => ({
      time: s.time.slice(0, 5),
      dose: Math.max(1, Math.round(Number(s.dose) || 1)),
      active: s.active !== false,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
  if (clean.length) return clean;
  if (legacy.time) {
    return [{ time: legacy.time, dose: Math.max(1, Math.round(Number(legacy.dose) || 1)), active: !!legacy.scheduleActive }];
  }
  return [{ time: DEFAULT_TIME, dose: 1, active: false }];
}

export function compSchedules(comp) {
  return normalizeSchedules(comp?.schedules, comp);
}

export function activeSchedules(comp) {
  return compSchedules(comp).filter((s) => s.active);
}

// "08:00 · 20:00" (or a friendly fallback) for list/summary views.
export function scheduleLabel(comp) {
  const active = activeSchedules(comp);
  if (!active.length) return 'No schedule set';
  return active.map((s) => s.time).join(' · ');
}

function withSchedules(comp, schedules) {
  const list = normalizeSchedules(schedules, comp);
  const first = list.find((s) => s.active) || list[0];
  return {
    ...comp,
    schedules: list,
    time: first.time,
    dose: first.dose,
    scheduleActive: list.some((s) => s.active),
  };
}

function blankCompartments() {
  return Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    name: '',
    dose: 1,
    time: DEFAULT_TIME,
    schedules: [{ time: DEFAULT_TIME, dose: 1, active: false }],
    count: 0,
    maxPills: 30,
    scheduleActive: false,
  }));
}

// The dispenser has exactly 12 tubes. Saved state from an older 13-compartment
// build can still contain compartment 13; drop it so it never renders.
function normalizeCompartments(saved) {
  const fallback = seedCompartments();
  if (!Array.isArray(saved) || saved.length === 0) return fallback;
  const kept = saved
    .filter((c) => c && Number.isInteger(Number(c.id)) && Number(c.id) >= 1 && Number(c.id) <= 12)
    .map((c) => withSchedules({ ...c, id: Number(c.id) }, c.schedules))
    .sort((a, b) => a.id - b.id);
  if (kept.length === 0) return fallback;
  const byId = new Map(kept.map((c) => [c.id, c]));
  return Array.from({ length: 12 }, (_, i) => byId.get(i + 1) || blankCompartments()[i]);
}

function seedCompartments() {
  const c = blankCompartments();
  c[0] = withSchedules(
    { ...c[0], name: 'Heart pill', count: 26 },
    [{ time: '08:00', dose: 1, active: true }],
  );
  c[1] = withSchedules(
    { ...c[1], name: 'Blood pressure', count: 13 },
    [{ time: '08:00', dose: 2, active: true }, { time: '20:00', dose: 2, active: true }],
  );
  c[2] = withSchedules(
    { ...c[2], name: 'Vitamin D', count: 6 },
    [{ time: '20:00', dose: 1, active: true }],
  );
  return c;
}

export function pillLevel(count, max = 30) {
  if (!count || count <= 0) return 'EMPTY';
  const pct = (count / max) * 100;
  if (pct < 25) return 'LOW';
  if (pct <= 75) return 'MEDIUM';
  return 'FULL';
}

export function levelMeta(level) {
  return {
    FULL: { label: 'FULL', dot: '🟢', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    MEDIUM: { label: 'MEDIUM', dot: '🟡', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
    LOW: { label: 'LOW', dot: '🔴', cls: 'text-red-700 bg-red-50 border-red-200' },
    EMPTY: { label: 'EMPTY', dot: '⚪', cls: 'text-slate-600 bg-slate-100 border-slate-200' },
  }[level] || { label: level, dot: '', cls: 'text-slate-600 bg-slate-100 border-slate-200' };
}

export const TIMEZONES = [
  'America/New_York (EST)',
  'America/Chicago (CST)',
  'America/Denver (MST)',
  'America/Los_Angeles (PST)',
  'Europe/London (GMT)',
  'Europe/Paris (CET)',
  'Asia/Kolkata (IST)',
  'Asia/Tokyo (JST)',
  'Australia/Sydney (AEST)',
];

const MANUAL_DROP_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const HEARTBEAT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// A pre-claimed serial to demonstrate the strict 1-to-1 rejection.
const SEEDED_CLAIMS = { 'DC-PROTO-07': 'other.caretaker@example.com' };

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

const saved = loadPersisted();

let store = {
  // connectivity (mirrors device manager + navigator)
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  serverReachable: null,
  lastPingAt: null,
  connectionMode: null,
  mqttConnected: false,
  bleConnected: false,
  bleDevice: null,
  bleTelemetry: null,
  bleLastEvent: null,
  bleWeight: null,
  bleLastSignal: null,
  bleRawLog: [],
  bleAutoReconnect: device.getState().bleAutoReconnect,
  bleReconnecting: false,
  bleReconnectAttempt: 0,
  deviceTime: null,
  bleSupported: typeof navigator !== 'undefined' && !!navigator.bluetooth,
  broker: device.getState().broker,
  pingUrl: device.getState().pingUrl,
  logs: [],
  deviceOnline: false,
  lastSeen: null,

  // auth + pairing
  auth: saved?.auth || null, // { email, name }
  deviceId: saved?.deviceId || null, // paired serial
  claims: { ...SEEDED_CLAIMS, ...(saved?.claims || {}) },

  // pause
  paused: saved?.paused || false,
  pauseUntil: saved?.pauseUntil || null,
  pauseReason: saved?.pauseReason || null,

  // dish
  dishState: saved?.dishState || DISH.EMPTY,
  dishComp: saved?.dishComp || null,
  dishSince: saved?.dishSince || null,
  lastDispenseAt: saved?.lastDispenseAt || null,
  interlockActive: saved?.interlockActive || false,

  // hardware
  battery: saved?.battery ?? 88,
  clogged: saved?.clogged || false,

  // data
  compartments: normalizeCompartments(saved?.compartments),
  events: saved?.events || [],
  settings: saved?.settings || {
    timezone: 'America/New_York (EST)',
    primaryContact: '',
    secondaryContact: '',
  },
};

const listeners = new Set();
function notify() {
  listeners.forEach((fn) => fn());
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        auth: store.auth,
        deviceId: store.deviceId,
        claims: store.claims,
        paused: store.paused,
        pauseUntil: store.pauseUntil,
        pauseReason: store.pauseReason,
        dishState: store.dishState,
        dishComp: store.dishComp,
        dishSince: store.dishSince,
        lastDispenseAt: store.lastDispenseAt,
        interlockActive: store.interlockActive,
        battery: store.battery,
        clogged: store.clogged,
        compartments: store.compartments,
        events: store.events.slice(0, 300),
        settings: store.settings,
      }),
    );
  } catch {
    /* ignore */
  }
}

function commit(patch) {
  store = { ...store, ...patch };
  persist();
  notify();
}

// ---------------- Audit trail ----------------
export function addEvent(type, detail, extra = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type,
    detail,
    ...extra,
  };
  commit({ events: [entry, ...store.events].slice(0, 500) });
  return entry;
}

// ---------------- Auth & pairing ----------------
export function login(email, name) {
  const mail = email.trim().toLowerCase();
  // Resolve the dispenser owned by THIS account (strict 1-to-1 via claims).
  const existing = Object.entries(store.claims).find(([, owner]) => owner === mail)?.[0] || null;
  commit({
    auth: { email: mail, name: name?.trim() || mail.split('@')[0] },
    deviceId: existing,
    deviceOnline: false,
    lastSeen: null,
  });
  return { deviceId: existing };
}

export function logout() {
  device.disconnect();
  // Sign-out ends the session only: release the runtime device link but keep
  // the ownership claim so the same caretaker can sign back in and re-link.
  commit({
    auth: null,
    deviceId: null,
    deviceOnline: false,
    lastSeen: null,
    connectionMode: null,
    paused: false,
    pauseUntil: null,
    interlockActive: false,
  });
}

const SERIAL_RE = /^DC-[A-Z0-9-]{2,20}$/i;

export function validateSerial(serial) {
  const s = (serial || '').trim().toUpperCase();
  if (!s) return { ok: false, error: 'Enter the Device Serial ID.' };
  if (!SERIAL_RE.test(s)) return { ok: false, error: 'Serial must look like DC-PROTO-01.' };
  return { ok: true, serial: s };
}

export function pairDevice(serial) {
  const v = validateSerial(serial);
  if (!v.ok) return v;
  const owner = store.claims[v.serial];
  if (owner && owner !== store.auth?.email) {
    return { ok: false, error: `Device ${v.serial} is already registered to another caretaker.` };
  }
  const claims = { ...store.claims, [v.serial]: store.auth?.email || 'me' };
  commit({ deviceId: v.serial, claims });
  addEvent(EVENT.DISPENSED, `Dispenser ${v.serial} paired to this account`);
  device.configure({});
  device.attach(v.serial);
  return { ok: true, serial: v.serial };
}

export function unpairDevice() {
  const id = store.deviceId;
  if (!id) return;
  const claims = { ...store.claims };
  delete claims[id];
  device.disconnect();
  commit({ deviceId: null, claims, deviceOnline: false, lastSeen: null, connectionMode: null });
  addEvent(EVENT.CONNECTION_LOST, `Dispenser ${id} unpaired from this account`);
}

// ---------------- Network guardrail ----------------
export function guardOnline() {
  if (!store.online) {
    toast('Action unavailable while offline.', 'error');
    return false;
  }
  return true;
}

export function retryPing() {
  return device.pingServer(store.pingUrl);
}

// ---------------- Pause / resume ----------------
export function pauseSystem(hours, reason = 'Manual pause') {
  if (!guardOnline()) return;
  const until = Date.now() + hours * 3600 * 1000;
  device.sendCommand('pause', { hours });
  commit({ paused: true, pauseUntil: until, pauseReason: reason });
  addEvent(EVENT.PAUSED, `System paused for ${hours}h (${reason})`);
  toast(`Dispenser paused for ${hours} hours`, 'warn');
}

export function resumeSystem() {
  if (!guardOnline()) return;
  device.sendCommand('resume', {});
  commit({ paused: false, pauseUntil: null, pauseReason: null });
  addEvent(EVENT.RESUMED, 'Pause cancelled — normal schedule resumed now');
  toast('Schedule resumed', 'success');
}

export function remainingPauseMs() {
  if (!store.paused || !store.pauseUntil) return 0;
  return Math.max(0, store.pauseUntil - Date.now());
}

// ---------------- Dish states & interlock ----------------
export function markTaken() {
  if (store.dishState === DISH.EMPTY) return;
  const mins = store.dishSince ? Math.round((Date.now() - store.dishSince) / 60000) : null;
  commit({ dishState: DISH.EMPTY, dishComp: null, dishSince: null, interlockActive: false });
  addEvent(EVENT.TAKEN, mins != null ? `Cleared from dish in ${mins} min` : 'Medication taken from dish');
}

export function detectForeignObject() {
  commit({ dishState: DISH.FOREIGN_OBJECT, interlockActive: false });
  addEvent(EVENT.FOREIGN, 'Weight detected outside a scheduled drop window — inspect & clear');
}

export function setDishWeight({ state, comp }) {
  commit({
    dishState: state,
    dishComp: comp ?? (state === DISH.EMPTY ? null : store.dishComp),
    dishSince: state === DISH.EMPTY ? null : (store.dishSince || Date.now()),
  });
}

// Attempt a scheduled dispense — enforces pause suppression + safety interlock.
export function attemptScheduledDispense(compId) {
  const comp = store.compartments.find((c) => c.id === compId);

  if (store.paused) {
    addEvent(EVENT.SUPPRESSED, `${comp?.name || `Compartment ${compId}`} dose suppressed during pause`);
    return { suppressed: true, reason: 'paused' };
  }

  if (store.dishState !== DISH.EMPTY) {
    commit({ interlockActive: true });
    addEvent(
      EVENT.INTERLOCK,
      `Dispense halted: uncollected ${store.dishState === DISH.FOREIGN_OBJECT ? 'object' : 'medication'} remains on dish (Compartment ${compId})`,
    );
    toast('Dispense Halted: Uncollected medication remains on dish', 'error');
    return { suppressed: true, reason: 'interlock' };
  }

  device.sendCommand('dispense', { comp: compId, dose: comp?.dose || 1 });
  commit({
    dishState: DISH.MEDICATION_PRESENT,
    dishComp: compId,
    dishSince: Date.now(),
    lastDispenseAt: Date.now(),
    interlockActive: false,
  });
  addEvent(EVENT.DISPENSED, `${comp?.name || `Compartment ${compId}`} dispensed (${comp?.dose || 1} pill)`);
  decrementCompartment(compId, comp?.dose || 1);
  return { suppressed: false };
}

function decrementCompartment(id, amount) {
  commit({
    compartments: store.compartments.map((c) =>
      c.id === id ? { ...c, count: Math.max(0, c.count - amount) } : c,
    ),
  });
}

// ---------------- Maintenance ----------------
export function manualDropCooldownLeft() {
  const last = store._lastManualDrop || 0;
  return Math.max(0, MANUAL_DROP_COOLDOWN_MS - (Date.now() - last));
}

export function manualDrop(compId) {
  if (!guardOnline()) return { ok: false };
  if (manualDropCooldownLeft() > 0) {
    toast('Cooldown active — please wait before dropping again.', 'warn');
    return { ok: false };
  }
  const comp = store.compartments.find((c) => c.id === compId);
  device.sendCommand('drop_replacement', { comp: compId, dose: 1 });
  commit({
    _lastManualDrop: Date.now(),
    dishState: DISH.MEDICATION_PRESENT,
    dishComp: compId,
    dishSince: Date.now(),
  });
  addEvent(EVENT.REPLACEMENT, `Replacement pill dropped from Compartment ${compId}${comp?.name ? ` (${comp.name})` : ''}`);
  toast('Replacement pill dropped', 'override');
  return { ok: true };
}

export function clearClog() {
  if (!guardOnline()) return;
  device.sendCommand('clear_clog', {});
  commit({ clogged: false });
  addEvent(EVENT.RESUMED, 'Tube clog cleared');
  toast('Clog cleared', 'success');
}

export function recordRefill(compId) {
  if (!guardOnline()) return;
  const comp = store.compartments.find((c) => c.id === compId);
  device.sendCommand('refill', { comp: compId });
  commit({
    compartments: store.compartments.map((c) =>
      c.id === compId ? { ...c, count: c.maxPills || 30 } : c,
    ),
  });
  addEvent(EVENT.REFILL, `Refilled Compartment ${compId}${comp?.name ? ` (${comp.name})` : ''} to full`);
  toast('Refill recorded', 'success');
}

export function updateCompartment(id, patch) {
  commit({
    compartments: store.compartments.map((c) => {
      if (c.id !== id) return c;
      if (patch.schedules) return withSchedules({ ...c, ...patch, schedules: patch.schedules }, patch.schedules);
      const next = { ...c, ...patch };
      if ('time' in patch || 'dose' in patch || 'scheduleActive' in patch) {
        const list = compSchedules(c);
        const first = {
          ...list[0],
          time: next.time || list[0].time,
          dose: next.dose || list[0].dose,
          active: 'scheduleActive' in patch ? !!patch.scheduleActive : list[0].active,
        };
        return withSchedules(next, [first, ...list.slice(1)]);
      }
      return next;
    }),
  });
}

// Replace a compartment's full list of daily dose times.
export function setCompSchedules(id, schedules) {
  commit({
    compartments: store.compartments.map((c) => (c.id === id ? withSchedules(c, schedules) : c)),
  });
}

export function updateSettings(patch) {
  commit({ settings: { ...store.settings, ...patch } });
}

// ---------------- Device event ingestion ----------------
function handleTelemetry(t) {
  const patch = {
    lastSeen: Date.now(),
    deviceOnline: true,
  };
  if (typeof t.battery === 'number') patch.battery = Math.max(0, Math.min(100, Math.round(t.battery)));
  if (typeof t.clog === 'boolean') patch.clogged = t.clog;
  if (t.paused === false && store.paused && store.pauseUntil && Date.now() >= store.pauseUntil) {
    patch.paused = false;
    patch.pauseUntil = null;
  }
  if (t.dish?.state && t.dish.state !== store.dishState) {
    patch.dishState = t.dish.state;
    patch.dishComp = t.dish.comp ?? null;
    patch.dishSince = t.dish.state === DISH.EMPTY ? null : (store.dishSince || Date.now());
  }
  commit(patch);
}

function handleDeviceEvent(e) {
  const type = e.type;
  if (type === EVENT.TAKEN) {
    markTaken();
  } else if (type === EVENT.DISPENSED) {
    addEvent(EVENT.DISPENSED, e.detail || 'Pill dispensed by dispenser');
  } else if (type === EVENT.REPLACEMENT) {
    addEvent(EVENT.REPLACEMENT, e.detail || 'Replacement drop confirmed by device');
  } else if (type === EVENT.REFILL) {
    addEvent(EVENT.REFILL, e.detail || 'Refill confirmed by device');
  } else if (type === EVENT.FOREIGN) {
    detectForeignObject();
  } else if (type === EVENT.CLOG) {
    commit({ clogged: true });
    addEvent(EVENT.CLOG, e.detail || 'Clog detected in dispensing tube');
  } else {
    addEvent(type, e.detail || '');
  }
}

function handleStatus(s) {
  if (s === 'offline') {
    commit({ deviceOnline: false });
    addEvent(EVENT.CONNECTION_LOST, 'Device reported offline (last will)');
  } else if (s === 'online') {
    commit({ deviceOnline: true, lastSeen: Date.now() });
  }
}

// ---------------- BLE status notifications ----------------
// The dispenser pushes { event, battery, online, paused, pill_in_dish, time }
// and may include a load-cell `weight` reading.
function handleBleTelemetry(t) {
  const prevEvent = store.bleLastEvent;
  const patch = { lastSeen: Date.now(), bleTelemetry: t };
  if (typeof t.battery === 'number') patch.battery = Math.max(0, Math.min(100, Math.round(t.battery)));
  if (typeof t.online === 'boolean') patch.deviceOnline = t.online;
  if (typeof t.paused === 'boolean') patch.paused = t.paused;
  if (typeof t.time === 'string') patch.deviceTime = t.time;
  if (typeof t.weight === 'number') patch.bleWeight = t.weight;
  if (typeof t.pill_in_dish === 'boolean') {
    if (t.pill_in_dish) {
      if (store.dishState !== DISH.FOREIGN_OBJECT) {
        patch.dishState = DISH.MEDICATION_PRESENT;
        patch.dishSince = store.dishSince || Date.now();
      }
    } else if (store.dishState === DISH.MEDICATION_PRESENT) {
      patch.dishState = DISH.EMPTY;
      patch.dishComp = null;
      patch.dishSince = null;
    }
  }
  if (t.event) patch.bleLastEvent = t.event;
  commit(patch);
  // Only log an audit entry when the event code actually changes (the device
  // may repeat the last event on every notification).
  if (t.event && t.event !== prevEvent) handleBleEvent(t.event);
}

// Raw text-protocol signals: "WEIGHT:12.4g", "ACK:DISPENSED:0", "ERROR:HX711".
let pendingWeight = null;
let pendingWeightSignal = null;
let weightTimer = null;

function handleBleSignal(sig) {
  if (!sig) return;

  // Weight streams fast; throttle commits to keep rendering/storage cheap.
  if (sig.kind === BLE_SIGNAL.WEIGHT && typeof sig.weightG === 'number') {
    pendingWeight = sig.weightG;
    pendingWeightSignal = sig;
    if (!weightTimer) {
      weightTimer = setTimeout(() => {
        weightTimer = null;
        if (pendingWeight == null) return;
        const patch = { bleWeight: pendingWeight, bleLastSignal: pendingWeightSignal, lastSeen: Date.now() };
        pendingWeight = null;
        pendingWeightSignal = null;
        commit(patch);
      }, 250);
    }
    return;
  }

  const patch = { bleLastSignal: sig, lastSeen: Date.now(), deviceOnline: true };

  if (sig.kind === BLE_SIGNAL.ACK) {
    const where = sig.tube == null ? '' : ` from tube ${sig.tube}`;
    if (sig.action === 'RECEIVED') {
      addEvent(EVENT.DISPENSED, `Dispense command received by device${where} (Bluetooth)`);
    } else if (sig.action === 'DISPENSED') {
      addEvent(EVENT.DISPENSED, `Servo sequence completed${where} (Bluetooth; physical delivery not verified)`);
    } else {
      addEvent(EVENT.CLOG, `Unexpected device acknowledgement: ${sig.action}${where} (Bluetooth)`);
    }
  }

  if (sig.kind === BLE_SIGNAL.ALERT) {
    commit({ ...patch, caregiverAlertAt: Date.now() });
    addEvent(EVENT.CLOG, 'Device reported an uncollected dose; exact session and compartment are unknown (Bluetooth)');
    toast('Uncollected-dose alert received from dispenser', 'error');
    return;
  }

  if (sig.kind === BLE_SIGNAL.ERROR) {
    addEvent(EVENT.CLOG, `Device error: ${sig.code} (Bluetooth)`);
    toast(`Dispenser error: ${sig.code}`, 'error');
  }

  commit(patch);
}

// Raw BLE traffic (debug terminal). Batched to avoid persisting/rendering on
// every high-frequency weight notification.
let rawQueue = [];
let rawTimer = null;
function handleBleRaw(entry) {
  rawQueue.push(entry);
  if (rawTimer) return;
  rawTimer = setTimeout(() => {
    rawTimer = null;
    const batch = rawQueue.reverse();
    rawQueue = [];
    commit({ bleRawLog: [...batch, ...store.bleRawLog].slice(0, 300) });
  }, 250);
}

function handleBleEvent(evt) {
  switch (evt) {
    case BLE_EVENT.PILL_DETECTED_IN_DISH:
      addEvent(EVENT.DISPENSED, 'Pill detected on the dish (Bluetooth)');
      break;
    case BLE_EVENT.DISH_CLEARED:
      addEvent(EVENT.TAKEN, 'Dish cleared — medication collected (Bluetooth)');
      break;
    case BLE_EVENT.DISPENSE_SUCCESS:
      addEvent(EVENT.DISPENSED, 'Dispense confirmed by device (Bluetooth)');
      break;
    case BLE_EVENT.DISPENSE_ERROR:
      commit({ clogged: true });
      addEvent(EVENT.CLOG, 'Dispense error reported by device (Bluetooth)');
      break;
    case BLE_EVENT.BATTERY_UPDATE:
      break; // battery already applied via the patch above
    case BLE_EVENT.CONNECTED:
      commit({ deviceOnline: true, lastSeen: Date.now() });
      break;
    default:
      addEvent(evt, 'Device event received over Bluetooth');
  }
}

// wire device manager -> store
device.on('telemetry', handleTelemetry);
device.on('ble-telemetry', handleBleTelemetry);
device.on('ble-signal', handleBleSignal);
device.on('ble-raw', handleBleRaw);
device.on('event', handleDeviceEvent);
device.on('status', handleStatus);
device.on('state', (d) => {
  commit({
    connectionMode: d.mode,
    mqttConnected: d.mqttConnected,
    bleConnected: d.bleConnected,
    bleDevice: d.bleDevice,
    bleTelemetry: d.bleTelemetry,
    bleLastEvent: d.bleLastEvent,
    bleWeight: d.bleWeight,
    bleLastSignal: d.bleLastSignal,
    bleAutoReconnect: d.bleAutoReconnect,
    bleReconnecting: d.bleReconnecting,
    bleReconnectAttempt: d.bleReconnectAttempt,
    bleSupported: d.bleSupported,
    serverReachable: d.serverReachable,
    lastPingAt: d.lastPingAt,
    broker: d.broker,
    pingUrl: d.pingUrl,
    logs: d.logs,
  });
});

// navigator online/offline
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => commit({ online: true }));
  window.addEventListener('offline', () => commit({ online: false }));
}

// master tick: auto-resume pause, heartbeat timeout, 30-min missed dose
let lastMissedKey = null;
setInterval(() => {
  const now = Date.now();
  const patch = {};

  if (store.paused && store.pauseUntil && now >= store.pauseUntil) {
    patch.paused = false;
    patch.pauseUntil = null;
    patch.pauseReason = null;
  }

  if (store.lastSeen && now - store.lastSeen > HEARTBEAT_TIMEOUT_MS && store.deviceOnline) {
    patch.deviceOnline = false;
  }

  if (Object.keys(patch).length) commit(patch);

  // Missed dose: medication sat in dish for 30 min
  if (store.dishState === DISH.MEDICATION_PRESENT && store.dishSince) {
    const mins = (now - store.dishSince) / 60000;
    const key = `${store.dishComp}-${store.dishSince}`;
    if (mins >= 30 && lastMissedKey !== key) {
      lastMissedKey = key;
      addEvent(EVENT.MISSED, `Medication uncollected for ${Math.round(mins)} min on Compartment ${store.dishComp}`);
    }
  }
}, 5000);

export function connectDevice() {
  if (store.deviceId) device.attach(store.deviceId);
}

// ---------------- Bluetooth (BLE) direct controls ----------------
// Low-level controls that talk to the dispenser over the BLE protocol.

async function sendBleSafe(commandObj) {
  if (!store.bleConnected) {
    toast('Connect to the dispenser via Bluetooth first.', 'warn');
    return false;
  }
  try {
    await device.sendBle(commandObj);
    return true;
  } catch (e) {
    toast(e.message || 'Bluetooth write failed', 'error');
    return false;
  }
}

async function sendBleRawSafe(text, label) {
  if (!store.bleConnected) {
    toast('Connect to the dispenser via Bluetooth first.', 'warn');
    return false;
  }
  try {
    await device.sendBleText(text, label);
    return true;
  } catch (e) {
    toast(e.message || 'Bluetooth write failed', 'error');
    return false;
  }
}

export function bleRequestStatus() {
  return sendBleSafe(bleCmd.getStatus());
}

export function bleTareDish() {
  sendBleSafe(bleCmd.tare());
  commit({ dishState: DISH.EMPTY, dishComp: null, dishSince: null, interlockActive: false, bleWeight: 0 });
  addEvent(EVENT.RESUMED, 'Scale tared — dish zeroed (Bluetooth)');
  toast('Dish tared to zero', 'success');
}

export async function bleSyncTime(date = new Date()) {
  const ok = await sendBleSafe(bleCmd.setTime(date.getHours(), date.getMinutes(), date.getSeconds()));
  if (ok) toast('Clock synced to dispenser', 'success');
  return ok;
}

export async function bleSetDelay(ms) {
  const ok = await sendBleSafe(bleCmd.setDelay(ms));
  if (ok) toast(`Pre-dispense delay set to ${ms} ms`, 'success');
  return ok;
}

export function blePause() {
  sendBleSafe(bleCmd.pause());
  commit({ paused: true, pauseUntil: null, pauseReason: 'Paused via Bluetooth' });
  addEvent(EVENT.PAUSED, 'System paused via Bluetooth');
  toast('Dispenser paused', 'warn');
}

export function bleResume() {
  sendBleSafe(bleCmd.resume());
  commit({ paused: false, pauseUntil: null, pauseReason: null });
  addEvent(EVENT.RESUMED, 'System resumed via Bluetooth');
  toast('Dispenser resumed', 'success');
}

export function bleSetAutoReconnect(enabled) {
  device.setBleAutoReconnect(enabled);
  toast(`Auto-reconnect ${enabled ? 'enabled' : 'disabled'}`, enabled ? 'success' : 'warn');
}

export async function bleReconnectNow() {
  if (!store.bleDevice) {
    toast('Scan for a dispenser first.', 'warn');
    return false;
  }
  try {
    await device.reconnectBleNow();
    toast('Reconnected over Bluetooth', 'success');
    return true;
  } catch (e) {
    toast(e.message || 'Reconnect failed', 'error');
    return false;
  }
}

export function bleClearLog() {
  rawQueue = [];
  if (rawTimer) {
    clearTimeout(rawTimer);
    rawTimer = null;
  }
  commit({ bleRawLog: [] });
}

// Fire a raw DISPENSE for a compartment (1-13). The firmware receives the
// zero-based UTF-8 index and acknowledgement determines command progress.
export async function bleDispense(tube) {
  const compId = tube + 1;
  const comp = store.compartments.find((c) => c.id === compId);

  if (store.paused) {
    addEvent(EVENT.SUPPRESSED, `Tube ${tube} dose suppressed during pause`);
    toast('Dispense blocked — system paused', 'warn');
    return { ok: false, reason: 'paused' };
  }
  if (store.dishState !== DISH.EMPTY) {
    commit({ interlockActive: true });
    addEvent(EVENT.INTERLOCK, `Dispense halted: dish not empty (Tube ${tube})`);
    toast('Dispense halted — clear the dish first', 'error');
    return { ok: false, reason: 'interlock' };
  }

  const sent = await sendBleRawSafe(bleCmd.dispensePayload(tube), `DISPENSE tube ${tube}`);
  if (!sent) return { ok: false, reason: 'write_failed' };
  commit({ interlockActive: false });
  addEvent(EVENT.DISPENSED, `Dispense command for tube ${tube} sent via Bluetooth${comp?.name ? ` (${comp.name})` : ''}`);
  decrementCompartment(compId, 1);
  return { ok: true, outcome: 'command_sent' };
}

// Push one compartment's whole daily schedule (one SET_SCHEDULE per time slot).
export function bleSetSchedule(comp) {
  const slots = compSchedules(comp);
  slots.forEach((slot, idx) => {
    const [hh, mm] = String(slot.time || DEFAULT_TIME).split(':').map(Number);
    setTimeout(() => {
      sendBleSafe(
        bleCmd.setSchedule(idx, comp.id - 1, hh || 0, mm || 0, slot.dose || 1, !!slot.active),
      );
    }, idx * 120);
  });
  return slots.length;
}

// Push every compartment's schedule in one go.
export function blePushAllSchedules() {
  const activeComps = store.compartments.filter((c) => c.scheduleActive);
  const slotCount = activeComps.reduce((sum, c) => sum + compSchedules(c).length, 0);
  activeComps.forEach((c, i) => {
    setTimeout(() => bleSetSchedule(c), i * 300); // gentle pacing over BLE
  });
  toast(`Pushing ${slotCount} dose time(s) across ${activeComps.length} compartment(s)`, 'info');
}


// ---------------- Hooks ----------------
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getStore() {
  return store;
}
export function useStore() {
  return useSyncExternalStore(subscribe, getStore);
}

export { EVENT };
