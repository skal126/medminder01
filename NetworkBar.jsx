import { useState } from 'react';
import { useStore, retryPing } from '../lib/store';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function NetworkBar() {
  const { online, serverReachable } = useStore();
  const [busy, setBusy] = useState(false);

  async function ping() {
    setBusy(true);
    await retryPing();
    setBusy(false);
  }

  if (!online) {
    return (
      <div className="flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-sm font-semibold text-white">
        <WifiOff className="h-4 w-4" />
        <span>Offline Mode — internet connection required to send commands</span>
      </div>
    );
  }

  const degraded = serverReachable === false;

  return (
    <div
      className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold ${
        degraded ? 'bg-amber-100 text-amber-800' : 'bg-emerald-600 text-white'
      }`}
    >
      {degraded ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
      <span>{degraded ? 'Server unreachable — check connection' : 'Network Connected & Syncing'}</span>
      <button
        onClick={ping}
        disabled={busy}
        className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold hover:bg-white/30 disabled:opacity-60"
      >
        <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
        Retry Ping
      </button>
    </div>
  );
}
