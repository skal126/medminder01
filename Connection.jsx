import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, guardOnline } from '../lib/store';
import { device } from '../lib/device';
import { btn } from '../lib/ui';
import { toast } from '../lib/toast';
import {
  Bluetooth, Search, Cable, Plug, PlugZap, RefreshCw, Terminal, Activity,
} from 'lucide-react';
import Modal from '../components/Modal';

export default function Connection() {
  const s = useStore();
  const [broker, setBroker] = useState(s.broker);
  const [pingUrl, setPingUrl] = useState(s.pingUrl);
  const [busy, setBusy] = useState(false);
  const [blePick, setBlePick] = useState(null);

  const lastSeenTxt = s.lastSeen ? new Date(s.lastSeen).toLocaleTimeString() : '—';

  async function doScan() {
    if (!guardOnline()) return;
    setBusy(true);
    try {
      const dev = await device.scanBle();
      setBlePick(dev);
    } catch (e) {
      toast(e.message || 'Scan cancelled', 'warn');
    } finally {
      setBusy(false);
    }
  }

  async function doConnectBle() {
    setBusy(true);
    try {
      await device.connectBle(blePick);
      toast('Connected via Bluetooth', 'success');
      setBlePick(null);
    } catch (e) {
      toast(e.message || 'BLE connect failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  function doMqtt() {
    if (!guardOnline()) return;
    if (!s.deviceId) return toast('Pair a dispenser first', 'warn');
    device.connectMqtt(s.deviceId);
    toast('Connecting to MQTT broker…', 'info');
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight text-sky-900">Device Connection</h1>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Card label="Mode" value={s.connectionMode.toUpperCase()} tone="info" />
        <Card label="MQTT" value={s.mqttConnected ? 'Connected' : 'Down'} tone={s.mqttConnected ? 'success' : 'critical'} />
        <Card label="Bluetooth" value={s.bleConnected ? 'Connected' : 'Idle'} tone={s.bleConnected ? 'success' : 'info'} />
        <Card label="Last Seen" value={lastSeenTxt} tone={s.deviceOnline ? 'success' : 'critical'} />
      </div>

      {/* Long range */}
      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Cable className="h-5 w-5 text-slate-600" />
          <h2 className="font-extrabold text-slate-900">Long Range — MQTT over WebSocket</h2>
        </div>
        <p className="text-sm text-slate-600">
          The prototype connects outbound to a broker over Wi-Fi, so it can be controlled from anywhere in the world.
          This portal subscribes to the same broker. No public IP or port-forwarding needed.
        </p>
        <label className="block text-sm font-bold text-slate-700">Broker URL (WSS)</label>
        <input value={broker} onChange={(e) => setBroker(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-sky-500" />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { device.configure({ broker }); toast('Broker saved', 'success'); }} className={btn('ghost')}>Save Broker</button>
          <button onClick={doMqtt} className={btn('primary')} disabled={busy}>
            <PlugZap className="h-4 w-4" /> Connect MQTT
          </button>
          <button onClick={() => { device.disconnect(); device.attach(s.deviceId); }} className={btn('ghost')}>
            <Plug className="h-4 w-4" /> Disconnect
          </button>
        </div>
      </section>

      {/* Short range */}
      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Bluetooth className="h-5 w-5 text-sky-600" />
          <h2 className="font-extrabold text-slate-900">Short Range — Bluetooth (BLE)</h2>
        </div>
        <p className="text-sm text-slate-600">
          Scan for a nearby dispenser for local control and first-time setup.
          {!s.bleSupported && <b className="text-red-600"> Web Bluetooth is not available in this browser — use Chrome or Edge.</b>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={doScan} disabled={busy || !s.bleSupported} className={btn('primary')}>
            <Search className="h-4 w-4" /> Scan for Dispensers
          </button>
          <button onClick={() => { device.disconnect(); device.attach(s.deviceId); }} className={btn('ghost')}>Disconnect BLE</button>
        </div>
        {s.bleDevice && (
          <div className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">
            Connected: {s.bleDevice.name} ({s.bleDevice.id})
          </div>
        )}
        <Link to="/bluetooth" className={btn('ghost', 'w-full')}>
          <Bluetooth className="h-4 w-4" /> Open Bluetooth Controls (12 compartments, scheduler, pause)
        </Link>
      </section>

      {/* Server ping */}
      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-slate-600" />
          <h2 className="font-extrabold text-slate-900">Server Ping Health Check</h2>
        </div>
        <label className="block text-sm font-bold text-slate-700">Health endpoint</label>
        <input value={pingUrl} onChange={(e) => setPingUrl(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-sky-500" />
        <div className="flex items-center gap-3">
          <button
            onClick={async () => { device.configure({ pingUrl }); await device.pingServer(pingUrl); }}
            className={btn('primary')}
          >
            <RefreshCw className="h-4 w-4" /> Ping Now
          </button>
          <span className={`text-sm font-bold ${s.serverReachable === false ? 'text-red-600' : s.serverReachable ? 'text-emerald-700' : 'text-slate-500'}`}>
            {s.serverReachable === null ? 'Unknown' : s.serverReachable ? 'Reachable' : 'Unreachable'}
          </span>
        </div>
      </section>

      {/* Logs */}
      <section className="space-y-2 rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2 text-slate-200">
          <Terminal className="h-4 w-4" />
          <h2 className="font-extrabold">Diagnostic Log</h2>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
          {s.logs.length === 0 && <div className="text-slate-500">No activity yet.</div>}
          {s.logs.map((l, i) => (
            <div key={i} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-300' : 'text-emerald-300'}>
              [{new Date(l.t).toLocaleTimeString()}] {l.line}
            </div>
          ))}
        </div>
      </section>

      {blePick && (
        <Modal title="Pair via Bluetooth" onClose={() => setBlePick(null)}>
          <p className="text-sm text-slate-700">Connect to <b>{blePick.name}</b>?</p>
          <div className="mt-4 flex gap-2">
            <button onClick={doConnectBle} className={btn('primary', 'flex-1')}>Connect</button>
            <button onClick={() => setBlePick(null)} className={btn('ghost', 'flex-1')}>Cancel</button>
          </div>
        </Modal>
      )}

    </div>
  );
}

function Card({ label, value, tone }) {
  const map = { success: 'text-emerald-700', critical: 'text-red-700', info: 'text-sky-700' };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-extrabold ${map[tone] || 'text-slate-800'}`}>{value}</div>
    </div>
  );
}
