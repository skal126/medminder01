import { useStore } from '../lib/store';
import { WifiOff } from 'lucide-react';

export default function NetworkStatus() {
  const { networkOnline } = useStore();
  if (networkOnline) return null;
  return (
    <div className="bg-red-600 text-white text-xs py-2 px-4 flex items-center justify-center gap-2">
      <WifiOff className="w-4 h-4" />
      <span className="font-semibold">No network connection</span>
    </div>
  );
}
