import { NavLink } from 'react-router-dom';
import { Sun, LayoutGrid, Bluetooth, History, Settings, Radio } from 'lucide-react';

const links = [
  { to: '/today', label: 'Home', Icon: Sun },
  { to: '/schedule', label: 'Pills', Icon: LayoutGrid },
  { to: '/bluetooth', label: 'Bluetooth', Icon: Bluetooth },
  { to: '/history', label: 'Audit', Icon: History },
  { to: '/connection', label: 'Device', Icon: Radio },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/70 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-stretch justify-around px-2 py-1.5">
        {links.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-bold transition ${
                isActive ? 'text-sky-700' : 'text-slate-500 hover:text-slate-700'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
