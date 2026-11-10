import { useToasts, dismiss } from '../lib/toast';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

const styles = {
  success: { cls: 'bg-emerald-600', Icon: CheckCircle2 },
  warn: { cls: 'bg-amber-500', Icon: AlertTriangle },
  error: { cls: 'bg-red-600', Icon: XCircle },
  override: { cls: 'bg-orange-500', Icon: AlertTriangle },
  info: { cls: 'bg-slate-800', Icon: Info },
};

export default function Toaster() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const s = styles[t.type] || styles.info;
        const Icon = s.Icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl ${s.cls} px-4 py-3 text-white shadow-lg`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-sm font-semibold">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-white/80 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
