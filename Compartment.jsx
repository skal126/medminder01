import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  useStore, updateCompartment, recordRefill, manualDrop,
  manualDropCooldownLeft, pillLevel, levelMeta,
  compSchedules, scheduleLabel,
} from '../lib/store';
import { btn } from '../lib/ui';
import { ArrowLeft, Droplet, RotateCcw, Pencil, Lock } from 'lucide-react';
import Modal from '../components/Modal';

export default function Compartment() {
  const { id } = useParams();
  const compId = Number(id);
  const s = useStore();
  const comp = s.compartments.find((c) => c.id === compId);

  const [, force] = useState(0);
  const [showRefill, setShowRefill] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const [form, setForm] = useState(null);
  useEffect(() => {
    if (comp) setForm({ name: comp.name, schedules: compSchedules(comp) });
  }, [comp?.id]); // eslint-disable-line

  if (!comp) {
    return (
      <div className="space-y-4">
        <Link to="/schedule" className={btn('ghost')}><ArrowLeft className="h-4 w-4" /> Back</Link>
        <p className="font-semibold text-slate-600">Compartment not found.</p>
      </div>
    );
  }

  const level = pillLevel(comp.count, comp.maxPills);
  const meta = levelMeta(level);
  const pct = Math.min(100, (comp.count / comp.maxPills) * 100);
  const cooldown = manualDropCooldownLeft();
  const cooldownSec = Math.ceil(cooldown / 1000);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/schedule" className="rounded-full border border-slate-200 bg-white p-2 hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4 text-slate-700" />
        </Link>
        <h1 className="text-xl font-extrabold text-sky-900">Compartment {comp.id}</h1>
        <span className={`ml-auto rounded-full border px-2.5 py-1 text-xs font-extrabold ${meta.cls}`}>{meta.dot} {meta.label}</span>
      </div>

      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="flex justify-between">
          <div>
            <div className="text-sm font-bold text-slate-500">Pill Name</div>
            <div className="font-extrabold text-slate-900">{comp.name || 'Unnamed'}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-slate-500">Schedule</div>
            <div className="font-extrabold text-slate-900">{scheduleLabel(comp)}</div>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm font-bold text-slate-700">
            <span>Pill Level: {level}</span>
            <span>{level === 'EMPTY' ? 'No pills remaining' : level === 'LOW' ? 'Low stock' : level === 'MEDIUM' ? 'In stock' : 'Full'}</span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full ${level === 'LOW' ? 'bg-red-500' : level === 'MEDIUM' ? 'bg-amber-500' : level === 'EMPTY' ? 'bg-slate-300' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          <Lock className="h-4 w-4" /> Lid is physically key-locked. Refills are recorded here after unlocking.
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button onClick={() => setShowRefill(true)} className={btn('success')}>
            <RotateCcw className="h-4 w-4" /> Record Refill
          </button>
          <button
            onClick={() => setShowDrop(true)}
            disabled={cooldown > 0}
            className={btn('primary')}
          >
            <Droplet className="h-4 w-4" /> {cooldown > 0 ? `Cooldown ${cooldownSec}s` : 'Drop Replacement Pill'}
          </button>
          <button onClick={() => setShowEdit(true)} className={btn('ghost')}>
            <Pencil className="h-4 w-4" /> Edit Details
          </button>
        </div>


      </div>

      {showRefill && (
        <Modal title="Record Refill" onClose={() => setShowRefill(false)}>
          <p className="text-sm text-slate-700">
            Confirm you have unlocked the lid and refilled <b>Compartment {comp.id}</b>
            {comp.name ? ` (${comp.name})` : ''}. This resets the level to <b>FULL</b>.
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => { recordRefill(comp.id); setShowRefill(false); }} className={btn('success', 'flex-1')}>Confirm Refill</button>
            <button onClick={() => setShowRefill(false)} className={btn('ghost', 'flex-1')}>Cancel</button>
          </div>
        </Modal>
      )}

      {showDrop && (
        <Modal title="Drop Replacement Pill" onClose={() => setShowDrop(false)}>
          <div className="rounded-2xl bg-orange-50 p-3 text-sm font-semibold text-orange-900">
            Step 1 of 2 — Confirm dropping 1 replacement pill from Compartment #{comp.id}
            {comp.name ? ` (${comp.name})` : ''}?
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Use this only if the patient dropped a pill on the floor. A 2-minute cooldown applies after use.
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => { manualDrop(comp.id); setShowDrop(false); }} className={btn('override', 'flex-1')}>
              Confirm Drop
            </button>
            <button onClick={() => setShowDrop(false)} className={btn('ghost', 'flex-1')}>Cancel</button>
          </div>
        </Modal>
      )}

      {showEdit && form && (
        <Modal title="Edit Compartment" onClose={() => setShowEdit(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-bold text-slate-700">Pill Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-500" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700">Dose times (per day)</label>
                <button
                  onClick={() => setForm({ ...form, schedules: [...form.schedules, { time: '20:00', dose: 1, active: true }] })}
                  className="rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800"
                >
                  + Add time
                </button>
              </div>
              {form.schedules.map((slot, i) => (
                <div key={i} className="grid grid-cols-[1fr_4.5rem_auto_auto] items-end gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500">Time</label>
                    <input
                      type="time"
                      value={slot.time}
                      onChange={(e) => {
                        const schedules = form.schedules.map((s, j) => (j === i ? { ...s, time: e.target.value } : s));
                        setForm({ ...form, schedules });
                      }}
                      className="mt-0.5 w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500">Pills</label>
                    <input
                      type="number" min="1" max="10" value={slot.dose}
                      onChange={(e) => {
                        const schedules = form.schedules.map((s, j) => (j === i ? { ...s, dose: Number(e.target.value) } : s));
                        setForm({ ...form, schedules });
                      }}
                      className="mt-0.5 w-full rounded-xl border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-sky-500"
                    />
                  </div>
                  <label className="flex h-9 items-center gap-1 text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={slot.active}
                      onChange={(e) => {
                        const schedules = form.schedules.map((s, j) => (j === i ? { ...s, active: e.target.checked } : s));
                        setForm({ ...form, schedules });
                      }}
                      className="h-4 w-4"
                    />
                    On
                  </label>
                  <button
                    onClick={() => {
                      const schedules = form.schedules.filter((_, j) => j !== i);
                      setForm({ ...form, schedules: schedules.length ? schedules : [{ time: '08:00', dose: 1, active: false }] });
                    }}
                    className="h-9 rounded-xl border border-slate-300 px-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    title="Remove this time"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <p className="text-[11px] font-semibold text-slate-500">
                One pill can be dispensed several times a day — add a row for every scheduled dose.
              </p>
            </div>

            <button onClick={() => { updateCompartment(comp.id, { name: form.name, schedules: form.schedules }); setShowEdit(false); }} className={btn('primary', 'w-full')}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
