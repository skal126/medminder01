import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useStore, updateCompartment, bleDispense, blePause, bleResume, bleTareDish,
  bleSyncTime, bleSetDelay, bleRequestStatus, bleSetSchedule, blePushAllSchedules,
  bleSetAutoReconnect, bleReconnectNow, bleClearLog, compSchedules,
} from '../lib/store';
import { device } from '../lib/device';
import { btn } from '../lib/ui';
import { toast } from '../lib/toast';
import {
  Bluetooth, BluetoothConnected, Power, Pause, Play, BatteryFull, BatteryLow,
  Clock, Scale, RefreshCw, Timer, Cable, Send, Terminal, Droplet, Plus, Trash2, RotateCw,
} from 'lucide-react';

const TUBES = Array.from({ length: 13 }, (_, i) => i);

export default function BleControl() {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const [delayMs, setDelayMs] = useState(1000);

  const connected = s.bleConnected && s.connectionMode === 'ble';
  const pillInDish = s.bleTelemetry?.pill_in_dish ?? (s.dishState === 'MEDICATION_PRESENT');
  const battery = s.bleTelemetry?.battery ?? s.battery;
  const lowBatt = battery < 15;
  const weight = s.bleWeight;

  async function connect() {
    if (!s.bleSupported) {
      toast('Web Bluetooth is not available — use Chrome or Edge.', 'error');
      return;
    }
    setBusy(true);
    try {
      const dev = await device.scanBle();
      await device.connectBle(dev);
      toast('Connected via Bluetooth', 'success');
    } catch (e) {
      toast(e.message || 'Bluetooth connect failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function reconnect() {
    setBusy(true);
    try {
      await bleReconnectNow();
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    device.disconnect();
    toast('Bluetooth disconnected', 'warn');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bluetooth className="h-6 w-6 text-sky-600" />
        <h1 className="text-2xl font-extrabold tracking-tight text-sky-900">Bluetooth Controls</h1>
      </div>

      {/* Pill-in-dish visual alert */}
      {pillInDish && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-red-400 bg-red-50 p-4">
          <span className="relative mt-0.5 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-red-600" />
          </span>
          <div>
            <div className="font-extrabold text-red-800">Pill detected on the dish</div>
            <div className="text-sm font-semibold text-red-700">
              A dose is sitting on the load cell. Please collect it — new dispenses are blocked until the dish is clear.
            </div>
          </div>
        </div>
      )}

      {/* Connection */}
      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-extrabold text-slate-900">
            {connected ? <BluetoothConnected className="h-5 w-5 text-sky-600" /> : <Bluetooth className="h-5 w-5 text-slate-500" />}
            {connected ? 'Connected' : s.bleReconnecting ? `Reconnecting… (${s.bleReconnectAttempt})` : 'Not connected'}
          </div>
          {s.bleDevice && (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800">
              {s.bleDevice.name}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-600">
          Discovers any <b>DC-PROTO-xx</b> dispenser by service UUID or name prefix.
          {!s.bleSupported && <b className="text-red-600"> Web Bluetooth is not available in this browser.</b>}
        </p>
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <>
              <button onClick={connect} disabled={busy || !s.bleSupported} className={btn('primary')}>
                <Power className="h-4 w-4" /> {busy ? 'Scanning…' : 'Scan & Connect'}
              </button>
              {s.bleDevice && (
                <button onClick={reconnect} disabled={busy} className={btn('ghost')}>
                  <RotateCw className="h-4 w-4" /> Reconnect now
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={disconnect} className={btn('danger')}>
                <Cable className="h-4 w-4" /> Disconnect
              </button>
              <button onClick={() => bleRequestStatus()} className={btn('ghost')}>
                <RefreshCw className="h-4 w-4" /> Get Status
              </button>
            </>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <input
            type="checkbox"
            checked={!!s.bleAutoReconnect}
            onChange={(e) => bleSetAutoReconnect(e.target.checked)}
            className="h-4 w-4"
          />
          Auto-reconnect if the Bluetooth link drops
        </label>
      </section>

      {/* Status indicators */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <Stat label="Battery" value={`${battery}%`} tone={lowBatt ? 'critical' : 'success'} icon={lowBatt ? BatteryLow : BatteryFull} />
        <Stat label="Scale" value={weight == null ? '—' : `${weight.toFixed(1)} g`} tone="info" icon={Scale} />
        <Stat label="Device" value={s.deviceOnline ? 'Online' : 'Offline'} tone={s.deviceOnline ? 'success' : 'critical'} />
        <Stat label="Paused" value={s.paused ? 'Yes' : 'No'} tone={s.paused ? 'warn' : 'success'} icon={s.paused ? Pause : Play} />
        <Stat label="Device Clock" value={s.deviceTime || '—'} tone="info" icon={Clock} />
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full ${lowBatt ? 'bg-red-500' : battery < 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.max(0, Math.min(100, battery))}%` }}
        />
      </div>

      {/* Pause / resume + maintenance */}
      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
        <h2 className="font-extrabold text-slate-900">System Control</h2>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={blePause} disabled={!connected} className={btn(s.paused ? 'ghost' : 'warn')}>
            <Pause className="h-4 w-4" /> Pause
          </button>
          <button onClick={bleResume} disabled={!connected} className={btn(s.paused ? 'success' : 'ghost')}>
            <Play className="h-4 w-4" /> Resume
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={bleTareDish} disabled={!connected} className={btn('ghost')}>
            <Scale className="h-4 w-4" /> Zero / Tare Dish
          </button>
          <button onClick={() => bleSyncTime()} disabled={!connected} className={btn('ghost')}>
            <Clock className="h-4 w-4" /> Sync Time
          </button>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-sm font-bold text-slate-700">Pre-dispense delay (ms)</label>
            <input
              type="number" min="0" step="100" value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-500"
            />
          </div>
          <button onClick={() => bleSetDelay(delayMs)} disabled={!connected} className={btn('primary')}>
            <Timer className="h-4 w-4" /> Set
          </button>
        </div>
      </section>

      {/* 12 compartments */}
      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold text-slate-900">Dispense — 13 Compartments</h2>
          <span className="text-xs font-bold text-slate-500">tube 0–11</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {TUBES.map((tube) => {
            const comp = s.compartments[tube];
            return (
              <button
                key={tube}
                onClick={() => bleDispense(tube)}
                disabled={!connected}
                className="flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Tube {tube}</span>
                  <Droplet className="h-4 w-4 text-sky-600" />
                </div>
                <span className="mt-1 truncate text-sm font-extrabold text-slate-900">
                  {comp?.name || `Compartment ${tube + 1}`}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {comp?.scheduleActive ? 'Scheduled' : 'Not scheduled'} · {compSchedules(comp).length}×/day
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">
          Writes the plain index string (<code className="font-mono">"0"</code>…<code className="font-mono">"11"</code>)
          to the dispense characteristic. The safety interlock blocks a dispense while a pill is already on the dish.
        </p>
      </section>

      {/* Scheduler */}
      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-extrabold text-slate-900">Medication Schedule</h2>
          <button onClick={blePushAllSchedules} disabled={!connected} className={btn('ghost')}>
            <Send className="h-4 w-4" /> Push All Active
          </button>
        </div>
        <p className="text-xs font-semibold text-slate-500">
          A pill can be taken more than once a day. Add a row for each dose time; each row becomes its own
          <code className="mx-1 font-mono">{'SET_SCHEDULE'}</code> slot.
        </p>
        <div className="space-y-2">
          {s.compartments.map((comp) => (
            <ScheduleRow key={comp.id} comp={comp} connected={connected} />
          ))}
        </div>
      </section>

      {/* Last parsed signal */}
      <section className="space-y-2 rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2 text-slate-200">
          <Terminal className="h-4 w-4" />
          <h2 className="font-extrabold">Last Parsed Signal</h2>
        </div>
        {s.bleLastSignal ? (
          <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 font-mono text-xs text-emerald-300">
            {JSON.stringify(s.bleLastSignal, null, 2)}
          </pre>
        ) : (
          <div className="font-mono text-xs text-slate-500">No signal received yet.</div>
        )}
        {s.bleTelemetry && (
          <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 font-mono text-xs text-sky-300">
            {JSON.stringify(s.bleTelemetry, null, 2)}
          </pre>
        )}
      </section>

      {/* Debug terminal: raw in/out traffic */}
      <section className="space-y-2 rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-200">
            <Terminal className="h-4 w-4" />
            <h2 className="font-extrabold">BLE Debug Terminal</h2>
          </div>
          <button
            onClick={bleClearLog}
            className="rounded-lg border border-slate-700 px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-800"
          >
            Clear
          </button>
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto font-mono text-xs">
          {s.bleRawLog.length === 0 && <div className="text-slate-500">No raw BLE traffic yet.</div>}
          {s.bleRawLog.map((e, i) => (
            <div key={`${e.ts}-${i}`} className={e.dir === 'out' ? 'text-sky-300' : 'text-emerald-300'}>
              [{new Date(e.ts).toLocaleTimeString()}] {e.dir === 'out' ? '→' : '←'} {JSON.stringify(e.text)}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          Raw notes are not persisted and are capped at 300 entries.
        </p>
      </section>

      <Link to="/connection" className={btn('ghost', 'w-full')}>
        <Cable className="h-4 w-4" /> Advanced connection settings
      </Link>
    </div>
  );
}

function ScheduleRow({ comp, connected }) {
  const [slots, setSlots] = useState(() => compSchedules(comp));

  useEffect(() => {
    setSlots(compSchedules(comp));
  }, [comp.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateSlot(i, patch) {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  function addSlot() {
    setSlots((prev) => [...prev, { time: '20:00', dose: 1, active: true }]);
  }

  function removeSlot(i) {
    setSlots((prev) => {
      const next = prev.filter((_, j) => j !== i);
      return next.length ? next : [{ time: '08:00', dose: 1, active: false }];
    });
  }

  function save() {
    const next = { ...comp, schedules: slots };
    updateCompartment(comp.id, { schedules: slots });
    if (connected) bleSetSchedule(next);
    else toast(`Saved ${slots.length} dose time(s) for Compartment ${comp.id} (connect to push)`, 'info');
  }

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-600">
          C{comp.id} · Tube {comp.id - 1} {comp.name ? `· ${comp.name}` : ''}
        </span>
        <button onClick={addSlot} className="flex items-center gap-0.5 rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-800">
          <Plus className="h-3 w-3" /> Time
        </button>
      </div>

      {slots.map((slot, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            type="time"
            value={slot.time}
            onChange={(e) => updateSlot(i, { time: e.target.value })}
            className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-sky-500"
          />
          <input
            type="number" min="1" max="10" value={slot.dose}
            onChange={(e) => updateSlot(i, { dose: Number(e.target.value) })}
            className="w-16 rounded-xl border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-sky-500"
            title="Pills per drop"
          />
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={slot.active} onChange={(e) => updateSlot(i, { active: e.target.checked })} className="h-4 w-4" />
            On
          </label>
          <button onClick={() => removeSlot(i)} className="ml-auto rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-200" title="Remove time">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <div className="flex justify-end">
        <button onClick={save} className={btn('primary', 'px-3 py-2')}>
          <Send className="h-3.5 w-3.5" /> Save & Send
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, icon: Icon }) {
  const map = { success: 'text-emerald-700', critical: 'text-red-700', info: 'text-sky-700', warn: 'text-amber-700' };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 flex items-center gap-1.5 text-lg font-extrabold ${map[tone] || 'text-slate-800'}`}>
        {Icon && <Icon className="h-4 w-4" />}
        {value}
      </div>
    </div>
  );
}
