// Shared button styles. Per the caretaker UI brief, button labels use a DARK
// font on a soft tinted fill for a calm, high-contrast healthcare look.

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS = {
  primary: 'bg-sky-100 text-sky-900 border border-sky-300 hover:bg-sky-200',
  solid: 'bg-sky-600 text-white hover:bg-sky-700',
  success: 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200',
  danger: 'bg-red-100 text-red-900 border border-red-300 hover:bg-red-200',
  critical: 'bg-red-600 text-white hover:bg-red-700',
  warn: 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200',
  override: 'bg-orange-100 text-orange-900 border border-orange-300 hover:bg-orange-200',
  ghost: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50',
  dark: 'bg-slate-800 text-white hover:bg-slate-900',
};

export function btn(variant = 'primary', extra = '') {
  return `${BASE} ${VARIANTS[variant] || VARIANTS.primary} ${extra}`;
}

export const TONE = {
  success: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  info: 'text-sky-700 bg-sky-50 border-sky-200',
  warn: 'text-amber-700 bg-amber-50 border-amber-200',
  critical: 'text-red-700 bg-red-50 border-red-200',
  override: 'text-orange-700 bg-orange-50 border-orange-200',
};
