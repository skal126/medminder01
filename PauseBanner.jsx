import { useStore, remainingPauseMs, resumeSystem } from '../lib/store';
import { Play } from 'lucide-react';

export default function PauseBanner() {
  const { paused, pauseUntil } = useStore();
  if (!paused || !pauseUntil) return null;
  const rem = remainingPauseMs();
  const hours = Math.floor(rem / 3600000);
  const mins = Math.floor((rem % 3600000) / 60000);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-amber-950 shadow-sm">
        <span>⏸️ Dispenser Paused — Schedule resumes in {hours}h {mins}m</span>
      </div>
      <button
        onClick={resumeSystem}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-100"
      >
        <Play className="h-4 w-4" /> Cancel Pause &amp; Resume Schedule Now
      </button>
    </div>
  );
}
