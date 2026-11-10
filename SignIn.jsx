import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, login, pairDevice, guardOnline } from '../lib/store';
import { btn } from '../lib/ui';
import { Wifi, WifiOff, ScanLine, Link2 } from 'lucide-react';
import { device } from '../lib/device';
import { toast } from '../lib/toast';

export default function SignIn() {
  const nav = useNavigate();
  const { online, auth, deviceId, bleSupported } = useStore();
  const [step, setStep] = useState(auth ? (deviceId ? 'done' : 'pair') : 'auth');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('DC-PROTO-01');
  const [error, setError] = useState('');

  function goAuth(e) {
    e.preventDefault();
    if (!guardOnline()) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    const res = login(email, name);
    // Does this account already have a linked device?
    if (res.deviceId) nav('/today');
    else setStep('pair');
    setError('');
  }

  function goPair(e) {
    e.preventDefault();
    if (!guardOnline()) return;
    const res = pairDevice(serial);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast(`Paired ${res.serial}`, 'success');
    nav('/today');
  }

  async function scan() {
    if (!guardOnline()) return;
    try {
      const dev = await device.scanBle();
      const s = (dev.name || '').toUpperCase();
      if (s) setSerial(s);
      toast(`Found ${dev.name || dev.id}`, 'info');
    } catch (err) {
      toast(err.message || 'Scan cancelled', 'warn');
    }
  }

  const activeAuth = auth;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6">
      <div className="w-full text-center">
        <PillMark />
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-sky-900">DoseCompass</h1>
        <p className="mt-2 text-slate-500">Caretaker Control Portal</p>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs font-bold">
          {online ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-red-600" />}
          <span className={online ? 'text-emerald-700' : 'text-red-700'}>
            {online ? 'Network Connected' : 'Offline — connection required'}
          </span>
        </div>

        {step === 'auth' && (
          <form onSubmit={goAuth} className="mt-6 space-y-4 text-left">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Caretaker email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com"
                autoFocus
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Your name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sam"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
            </div>
            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
            <button type="submit" className={btn('primary', 'w-full')}>
              <Link2 className="h-4 w-4" /> Sign In
            </button>
          </form>
        )}

        {step === 'pair' && (
          <form onSubmit={goPair} className="mt-6 space-y-4 text-left">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              Signed in as <b>{activeAuth?.email}</b>. No dispenser is linked yet — pair one to continue.
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">Pair Dispenser — Serial ID</label>
              <div className="flex gap-2">
                <input
                  value={serial}
                  onChange={(e) => { setSerial(e.target.value.toUpperCase()); setError(''); }}
                  placeholder="DC-PROTO-01"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-mono text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                />
                <button type="button" onClick={scan} className={btn('ghost', 'shrink-0 px-3')} title={bleSupported ? 'Scan for nearby dispenser' : 'Bluetooth not supported in this browser'}>
                  <ScanLine className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">One dispenser links to exactly one caretaker. Already-claimed IDs are rejected.</p>
              {error && <p className="mt-1.5 text-sm font-semibold text-red-600">{error}</p>}
            </div>
            <button type="submit" className={btn('primary', 'w-full')}>
              <Link2 className="h-4 w-4" /> Pair Dispenser
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
              Dispenser <b className="font-mono">{deviceId}</b> is linked to this account.
            </div>
            <button onClick={() => nav('/today')} className={btn('primary', 'w-full')}>
              Open Dashboard
            </button>
          </div>
        )}

        <p className="mt-6 text-xs text-slate-400">One caretaker account → One dispenser</p>
      </div>
    </div>
  );
}

function PillMark() {
  return (
    <div className="mx-auto flex h-16 w-24 items-center justify-center rounded-3xl bg-sky-600 shadow-md">
      <div className="flex items-center">
        <div className="h-7 w-3.5 rounded-l-full bg-sky-200" />
        <div className="h-7 w-5 rounded-full bg-white shadow" />
      </div>
    </div>
  );
}
