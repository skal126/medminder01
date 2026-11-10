import { useStore, pillLevel, levelMeta, activeSchedules, scheduleLabel } from '../lib/store';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

export default function Schedule() {
  const { compartments } = useStore();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-sky-900">12 Compartments</h1>
        <div className="flex flex-wrap gap-1.5 text-xs font-bold">
          <Legend level="FULL" /><Legend level="MEDIUM" /><Legend level="LOW" /><Legend level="EMPTY" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {compartments.map((c) => {
          const level = pillLevel(c.count, c.maxPills);
          const meta = levelMeta(level);
          return (
            <Link
              key={c.id}
              to={`/compartment/${c.id}`}
              className={`rounded-2xl border bg-white p-3.5 transition hover:shadow-md ${
                level === 'LOW' ? 'border-red-300' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Compartment {c.id}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${meta.cls}`}>
                  {meta.dot} {meta.label}
                </span>
              </div>
              <div className="mt-1.5 truncate font-extrabold text-slate-900">{c.name || 'Unnamed'}</div>
              <div className="mt-0.5 text-xs font-semibold text-slate-600">
                {activeSchedules(c).length ? `${scheduleLabel(c)} · ${activeSchedules(c).length}×/day` : 'No schedule set'}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">{level === 'EMPTY' ? 'Out of pills' : level === 'LOW' ? 'Low' : level === 'MEDIUM' ? 'OK' : 'Good'}</span>
                {level === 'LOW' && (
                  <span className="flex items-center gap-1 font-bold text-red-600">
                    <AlertCircle className="h-3.5 w-3.5" /> Refill
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full ${level === 'LOW' ? 'bg-red-500' : level === 'MEDIUM' ? 'bg-amber-500' : level === 'EMPTY' ? 'bg-slate-300' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, (c.count / c.maxPills) * 100)}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ level }) {
  const meta = levelMeta(level);
  return <span className={`rounded-full border px-2 py-0.5 ${meta.cls}`}>{meta.dot} {meta.label}</span>;
}
