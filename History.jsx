import { useState } from 'react';
import { useStore, eventMeta, EVENT } from '../lib/store';
import { TONE } from '../lib/ui';

const FILTERS = [
  { key: 'all', label: 'All Events' },
  { key: 'dispenses', label: 'Dispenses' },
  { key: 'safety', label: 'Safety Alerts' },
  { key: 'refills', label: 'Refills' },
];

const GROUPS = {
  dispenses: [EVENT.TAKEN, EVENT.DISPENSED, EVENT.MISSED, EVENT.SUPPRESSED, EVENT.REPLACEMENT, EVENT.PAUSED, EVENT.RESUMED],
  safety: [EVENT.INTERLOCK, EVENT.CLOG, EVENT.FOREIGN, EVENT.CONNECTION_LOST],
  refills: [EVENT.REFILL],
};

export default function History() {
  const { events } = useStore();
  const [filter, setFilter] = useState('all');

  const filtered = events.filter((e) => filter === 'all' || GROUPS[filter]?.includes(e.type));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight text-sky-900">Audit Trail</h1>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${
              filter === f.key ? 'bg-sky-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-bold text-slate-600">No events yet</p>
          <p className="mt-1 text-sm text-slate-500">Dispenses, safety alerts, and refills will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((e) => <Row key={e.id} e={e} />)}
        </div>
      )}
    </div>
  );
}

function Row({ e }) {
  const meta = eventMeta(e.type);
  const tone = TONE[meta.tone] || TONE.info;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5">
      <span className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-extrabold uppercase ${tone}`}>
        {meta.label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-800">{e.detail}</div>
        <div className="mt-0.5 text-xs text-slate-500">{new Date(e.timestamp).toLocaleString()}</div>
      </div>
    </div>
  );
}
