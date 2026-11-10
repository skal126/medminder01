import { useStore, DISH_STATES, markTaken, detectForeignObject } from '../lib/store';
import { btn, TONE } from '../lib/ui';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Bell, Lightbulb, Check, Trash2, Activity,
  PackageX, Droplets, ShieldAlert, ChevronRight,
} from 'lucide-react';
import PauseBanner from '../components/PauseBanner';
import PauseControls from '../components/PauseControls';

export default function Today() {
  const s = useStore();
  const pill = s.dishComp ? s.compartments.find((c) => c.id === s.dishComp) : null;
  const lowBatt = s.battery < 15;
  const lowStock = s.compartments.filter((c) => c.scheduleActive && (c.count < (c.maxPills || 30) * 0.25));
  const pillInDish = s.bleTelemetry?.pill_in_dish ?? (s.dishState === DISH_STATES.MEDICATION_PRESENT);

  return (
    <div className="space-y-4">
      <PauseBanner />

      {pillInDish && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-red-400 bg-red-50 p-4">
          <span className="relative mt-0.5 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-red-600" />
          </span>
          <div>
            <div className="font-extrabold text-red-800">Pill detected on the dish</div>
            <div className="text-sm font-semibold text-red-700">
              A dose is on the load cell{pill?.name ? ` (${pill.name})` : ''}. Please collect it — the safety interlock
              blocks new dispenses until the dish is clear.
            </div>
          </div>
        </div>
      )}

      {s.interlockActive && (
        <Banner tone="critical" icon={ShieldAlert} title="🚫 Dispense Halted — Safety Interlock">
          Uncollected medication or an object remains on the dish. New dispenses are blocked until it is cleared.
        </Banner>
      )}
      {s.clogged && (
        <Banner tone="critical" icon={AlertTriangle} title="🚨 Clog Detected in Dispensing Tube">
          Manual clearing required before the next dose.
        </Banner>
      )}
      {s.dishState === DISH_STATES.FOREIGN_OBJECT && (
        <Banner tone="warn" icon={AlertTriangle} title="⚠️ Foreign Object on Dish">
          Weight detected outside a scheduled drop window. Manually inspect &amp; clear the dish.
        </Banner>
      )}
      {!s.deviceOnline && s.deviceId && (
        <Banner tone="critical" icon={Activity} title="Device Disconnected">
          No heartbeat from {s.deviceId} in over 15 minutes. Check power and connection.
        </Banner>
      )}
      {lowBatt && (
        <Banner tone="critical" icon={PackageX} title={`Low Battery — ${s.battery}%`}>
          Charge or replace the dispenser battery.
        </Banner>
      )}

      <Hero s={s} />

      <DishCard s={s} pill={pill} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Battery" value={`${s.battery}%`} tone={lowBatt ? 'critical' : 'success'} />
        <Stat label="Device" value={s.deviceOnline ? 'Online' : 'Offline'} tone={s.deviceOnline ? 'success' : 'critical'} />
        <Stat label="Transport" value={s.connectionMode.toUpperCase()} tone="info" />
        <Stat label="Active Pills" value={String(s.compartments.filter((c) => c.scheduleActive).length)} tone="info" />
      </div>

      <PauseControls />

      {lowStock.length > 0 && (
        <div className={`rounded-2xl border p-4 ${TONE.warn}`}>
          <div className="mb-2 flex items-center gap-2 font-extrabold">
            <Droplets className="h-4 w-4" /> Refill Low Stock
          </div>
          <div className="space-y-1.5">
            {lowStock.map((c) => (
              <Link key={c.id} to={`/compartment/${c.id}`} className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold text-slate-800">
                <span>Compartment {c.id}{c.name ? ` · ${c.name}` : ''}</span>
                <span>{c.count} left <ChevronRight className="inline h-4 w-4" /></span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Link to="/schedule" className={btn('ghost')}>Manage 12 Compartments</Link>
        <Link to="/history" className={btn('ghost')}>View Audit Trail</Link>
      </div>
    </div>
  );
}

function Banner({ tone, icon: Icon, title, children }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${TONE[tone]}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <div className="font-extrabold text-slate-900">{title}</div>
        <div className="mt-0.5 text-sm text-slate-700">{children}</div>
      </div>
    </div>
  );
}

function Hero({ s }) {
  return (
    <div className="rounded-3xl bg-sky-600 p-5 text-white shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-sky-100">
            {new Date().toLocaleDateString(undefined, { weekday: 'long' })}
          </div>
          <div className="mt-1 text-2xl font-extrabold">Today at a glance</div>
          <div className="mt-1 text-xs font-semibold text-sky-100">
            {s.deviceId ? <span className="font-mono">{s.deviceId}</span> : 'No device paired'} · {s.settings.timezone}
          </div>
        </div>
        <div className="text-right text-3xl font-extrabold">
          {new Date().getDate()}
          <span className="block text-xs font-bold text-sky-100">
            {new Date().toLocaleDateString(undefined, { month: 'short' })}
          </span>
        </div>
      </div>
    </div>
  );
}

function DishCard({ s, pill }) {
  const isPresent = s.dishState === DISH_STATES.MEDICATION_PRESENT;
  const isForeign = s.dishState === DISH_STATES.FOREIGN_OBJECT;
  const elapsedMin = s.dishSince ? (Date.now() - s.dishSince) / 60000 : 0;
  const remain = Math.max(0, 30 - elapsedMin);
  const pct = Math.min(100, (elapsedMin / 30) * 100);

  const tone = isForeign ? 'warn' : isPresent ? 'info' : 'success';
  const stateLabel = isForeign ? 'Foreign Object' : isPresent ? 'Medication Present' : 'Empty';

  return (
    <div className={`rounded-3xl border p-5 ${TONE[tone]}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Dish Weight Sensor</div>
            <div className="text-lg font-extrabold text-slate-900">{stateLabel}</div>
          </div>
        </div>
        {isPresent && (
          <div className="flex items-center gap-2 text-xs font-bold text-sky-800">
            <span className="flex items-center gap-1 rounded-full bg-white/70 px-2 py-1"><Lightbulb className="h-3.5 w-3.5" /> Blue light</span>
            <span className="flex items-center gap-1 rounded-full bg-white/70 px-2 py-1"><Bell className="h-3.5 w-3.5" /> Beeping</span>
          </div>
        )}
      </div>

      {isPresent && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm font-bold text-slate-800">
            <span>{pill?.name ? `${pill.name}` : `Compartment ${s.dishComp}`}</span>
            <span>{Math.floor(remain)} min left of 30</span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/70">
            <div className={`h-full ${remain <= 5 ? 'bg-red-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={markTaken} className={btn('success')}>
              <Check className="h-4 w-4" /> Medication Taken
            </button>
            <button onClick={detectForeignObject} className={btn('warn')}>
              <AlertTriangle className="h-4 w-4" /> Flag Object
            </button>
          </div>
        </div>
      )}

      {isForeign && (
        <div className="mt-4">
          <p className="text-sm text-slate-700">The dish holds an object that was not scheduled. Inspect and remove it, then clear.</p>
          <button onClick={markTaken} className={btn('ghost', 'mt-3 w-full')}>
            <Trash2 className="h-4 w-4" /> Cleared &amp; Inspected
          </button>
        </div>
      )}

      {!isPresent && !isForeign && (
        <p className="mt-3 text-sm text-slate-600">Dish is at baseline. Ready for the next scheduled dispense.</p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const map = { success: 'text-emerald-700', critical: 'text-red-700', info: 'text-sky-700' };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-xl font-extrabold ${map[tone] || 'text-slate-800'}`}>{value}</div>
    </div>
  );
}
