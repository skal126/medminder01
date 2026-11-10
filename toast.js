import { useSyncExternalStore } from 'react';

let toasts = [];
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function useToasts() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => toasts,
  );
}

let idc = 0;
export function toast(message, type = 'info', ttl = 3200) {
  const id = ++idc;
  toasts = [...toasts, { id, message, type }];
  notify();
  if (ttl > 0) setTimeout(() => dismiss(id), ttl);
  return id;
}

export function dismiss(id) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}
