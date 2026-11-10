import { BatteryFull, BatteryLow, CircleDot, Cable, Bluetooth } from 'lucide-react';
import { useStore, DISH_STATES } from '../lib/store';
import NetworkBar from './NetworkBar';

export default function TopBar() {
  const { battery, dishState, auth, deviceId, deviceOnline, connectionMode, bleConnected } = useStore();
  const dishActive = dishState !== DISH_STATES.EMPTY;
  const lowBatt = battery < 15;

  return (
    <>
      <NetworkBar />
      <header className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <PillMark />
          <div>
            <div className="text-lg font-extrabold tracking-tight text-sky-900">DoseCompass</div>
            <div className="text-xs text-slate-500">
              {auth?.name ? `${auth.name} • Caretaker` : 'Caretaker Portal'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-700">
          <div className="hidden items-center gap-1.5 text-xs font-bold sm:flex" title="Transport">
            {bleConnected ? <Bluetooth className="h-4 w-4 text-sky-600" /> : <Cable className="h-4 w-4 text-slate-400" />}
            <span className="uppercase">{connectionMode}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <span className={`h-2 w-2 rounded-full ${deviceOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span>{deviceOnline ? 'Linked' : 'Offline'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold">
            {lowBatt ? <BatteryLow className="h-4 w-4 text-red-600" /> : <BatteryFull className="h-4 w-4 text-slate-600" />}
            <span className={lowBatt ? 'text-red-600' : ''}>{battery}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold" title={deviceId || 'No device'}>
            <CircleDot className={`h-3.5 w-3.5 ${dishActive ? 'text-amber-500' : 'text-slate-300'}`} />
            <span>{dishActive ? 'Dish active' : 'Dish empty'}</span>
          </div>
        </div>
      </header>
    </>
  );
}

function PillMark() {
  return (
    <div className="flex h-10 w-16 items-center justify-center rounded-2xl bg-sky-600">
      <div className="flex items-center">
        <div className="h-5 w-2.5 rounded-l-full bg-sky-200" />
        <div className="h-5 w-4 rounded-full bg-white shadow" />
      </div>
    </div>
  );
}
