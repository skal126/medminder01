import { useState } from 'react';
import { useStore, pauseSystem } from '../lib/store';
import { btn } from '../lib/ui';
import { Clock, Pause } from 'lucide-react';

export default function PauseControls() {
  const { paused } = useStore();
  const [customHrs, setCustomHrs] = useState(8);

  if (paused) return null; // the PauseBanner already offers resume

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-slate-600" />
        <h3 className="font-extrabold text-slate-900">System Pause / Delay Schedule</h3>
      </div>
      <p className="text-sm text-slate-600">
        While paused, scheduled doses are <b>skipped</b> (never queued). The dispenser resumes automatically.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => pauseSystem(6)} className={btn('warn')}><Pause className="h-4 w-4" /> Pause 6 Hours</button>
        <button onClick={() => pauseSystem(12)} className={btn('warn')}><Pause className="h-4 w-4" /> Pause 12 Hours</button>
      </div>
      <div className="flex gap-2">
        <input
          type="number" min="1" max="72" value={customHrs}
          onChange={(e) => setCustomHrs(Number(e.target.value))}
          className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-500"
        />
        <button onClick={() => pauseSystem(customHrs, 'Custom delay')} className={btn('ghost', 'flex-1')}>
          Pause Custom ({customHrs}h)
        </button>
      </div>
    </div>
  );
}
