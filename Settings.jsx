import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, updateSettings, unpairDevice, logout, TIMEZONES } from '../lib/store';
import { btn } from '../lib/ui';
import { toast } from '../lib/toast';
import { Globe, PhoneCall, ShieldAlert, Unlink, LogOut, Save } from 'lucide-react';
import Modal from '../components/Modal';

export default function Settings() {
  const nav = useNavigate();
  const s = useStore();
  const [form, setForm] = useState(s.settings);
  const [confirmUnpair, setConfirmUnpair] = useState(false);

  function save() {
    updateSettings(form);
    toast('Settings saved', 'success');
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight text-sky-900">Settings</h1>

      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-slate-600" />
          <h2 className="font-extrabold text-slate-900">Patient Timezone</h2>
        </div>
        <p className="text-sm text-slate-600">Schedule triggers follow the patient's local time.</p>
        <select
          value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-900 outline-none focus:border-sky-500"
        >
          {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </section>

      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-5 w-5 text-slate-600" />
          <h2 className="font-extrabold text-slate-900">Emergency Contacts</h2>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700">Primary caretaker phone</label>
          <input value={form.primaryContact} onChange={(e) => setForm({ ...form, primaryContact: e.target.value })} placeholder="+1 555 010 0000" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-500" />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700">Secondary emergency phone</label>
          <input value={form.secondaryContact} onChange={(e) => setForm({ ...form, secondaryContact: e.target.value })} placeholder="+1 555 010 1111" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-500" />
        </div>
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <b>Escalation Rule</b><br />
            30-Min Uncollected Alert → Primary Contact<br />
            45-Min Uncollected Alert → Secondary Emergency Contact
          </div>
        </div>
        <button onClick={save} className={btn('primary', 'w-full')}><Save className="h-4 w-4" /> Save Settings</button>
      </section>

      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
        <h2 className="font-extrabold text-slate-900">Account &amp; Device</h2>
        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm">
          <div className="text-slate-500">Signed in as</div>
          <div className="font-bold text-slate-800">{s.auth?.email}</div>
          <div className="mt-2 text-slate-500">Paired dispenser</div>
          <div className="font-mono font-bold text-slate-800">{s.deviceId || 'None'}</div>
        </div>
        <button onClick={() => setConfirmUnpair(true)} disabled={!s.deviceId} className={btn('danger', 'w-full')}>
          <Unlink className="h-4 w-4" /> Unpair Device
        </button>
        <button onClick={() => { logout(); nav('/signin'); }} className={btn('ghost', 'w-full')}>
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </section>

      {confirmUnpair && (
        <Modal title="Unpair Device" onClose={() => setConfirmUnpair(false)}>
          <p className="text-sm text-slate-700">
            This releases <b className="font-mono">{s.deviceId}</b> so it can be paired to another caretaker. You will need to re-pair to keep using it.
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => { unpairDevice(); setConfirmUnpair(false); toast('Device unpaired', 'warn'); }} className={btn('danger', 'flex-1')}>Unpair</button>
            <button onClick={() => setConfirmUnpair(false)} className={btn('ghost', 'flex-1')}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
