import { useEffect, useState } from 'react';
import { Check, Clipboard, KeyRound, Plus, RefreshCw, RotateCw, ShieldCheck, Store, UserRound, X } from 'lucide-react';
import { api, formatDate } from '../api.js';

const emptyForm = {
  name: '',
  email: '',
  agencyCommissionRate: '2.5',
  defaultPayoutPhone: '',
  defaultPayoutProvider: 'MTN',
};

export default function MerchantManager({ notify }) {
  const [merchants, setMerchants] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setError('');
    try {
      const result = await api('/api/admin/merchants');
      setMerchants(result.merchants);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function createMerchant(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await api('/api/admin/merchants', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          agencyCommissionRate: Number(form.agencyCommissionRate) / 100,
        }),
      });
      setIssued({ ...result.credentials, merchantName: result.merchant.name, kind: 'created' });
      setForm(emptyForm);
      await refresh();
      notify('Merchant connection created. Copy its secret now.');
    } catch (err) {
      setError(err.message);
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function setMerchantStatus(merchant) {
    const next = merchant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await api(`/api/admin/merchants/${merchant.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      notify(`${merchant.name} ${next === 'ACTIVE' ? 'activated' : 'suspended'}.`);
      await refresh();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  async function rotateKey(merchant) {
    if (!window.confirm(`Rotate credentials for ${merchant.name}? Its current client secret will stop working immediately.`)) return;
    try {
      const result = await api(`/api/admin/merchants/${merchant.id}/rotate-key`, { method: 'POST' });
      setIssued({ ...result.credentials, merchantName: merchant.name, kind: 'rotated' });
      notify('New credentials issued. The previous key is revoked.');
      await refresh();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  async function copyCredentials() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(`Client ID: ${issued.clientId}\nClient Secret: ${issued.clientSecret}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      notify('Clipboard access was blocked. Select and copy the key manually.', 'error');
    }
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-indigo-300">Tenant access</p>
          <h1 className="mt-1 font-['Space_Grotesk'] text-3xl font-semibold tracking-tight text-white">Client merchants</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Each merchant gets isolated API credentials, a configurable fee rate, and a saved payout destination for ledger records.</p>
        </div>
        <button onClick={refresh} className="btn-quiet text-xs"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh list</button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      <section className="glass rounded-2xl p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl border border-indigo-200/10 bg-indigo-400/10 p-2.5 text-indigo-300"><Plus size={17} /></div>
          <div><h2 className="font-semibold text-white">Register a client app</h2><p className="mt-1 text-xs text-slate-500">A live API key is generated once the merchant is saved.</p></div>
        </div>
        <form onSubmit={createMerchant} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-2 text-xs font-medium text-slate-400">App / merchant name
            <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="TruckShare" minLength="2" maxLength="120" required />
          </label>
          <label className="space-y-2 text-xs font-medium text-slate-400">Contact email
            <input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="payments@example.com" required />
          </label>
          <label className="space-y-2 text-xs font-medium text-slate-400">Agency commission (%)
            <div className="relative"><input className="field pr-10" type="number" min="0" max="50" step="0.01" value={form.agencyCommissionRate} onChange={(e) => setForm({ ...form, agencyCommissionRate: e.target.value })} required /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">%</span></div>
          </label>
          <label className="space-y-2 text-xs font-medium text-slate-400">Payout phone
            <input className="field" type="tel" value={form.defaultPayoutPhone} onChange={(e) => setForm({ ...form, defaultPayoutPhone: e.target.value })} placeholder="+256 772 123 456" required />
          </label>
          <label className="space-y-2 text-xs font-medium text-slate-400">Payout provider
            <select className="field" value={form.defaultPayoutProvider} onChange={(e) => setForm({ ...form, defaultPayoutProvider: e.target.value })}><option value="MTN">MTN Mobile Money</option><option value="AIRTEL">Airtel Money</option></select>
          </label>
          <div className="flex items-end"><button className="btn-primary w-full md:w-auto" disabled={saving}>{saving ? 'Creating…' : <><Plus size={15} /> Register merchant</>}</button></div>
        </form>
      </section>

      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4 sm:px-6">
          <div><h2 className="font-semibold text-white">Connected apps <span className="ml-2 rounded-full bg-white/[.06] px-2 py-0.5 text-xs text-slate-400">{merchants.length}</span></h2><p className="mt-1 text-xs text-slate-500">API secrets are never shown in this list.</p></div>
          <ShieldCheck size={18} className="text-emerald-300" />
        </div>
        <div className="scrollbar-soft overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-6 py-3 font-semibold">Merchant</th><th className="px-4 py-3 font-semibold">Client ID</th><th className="px-4 py-3 font-semibold">Fee</th><th className="px-4 py-3 font-semibold">Payout</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-6 py-3 text-right font-semibold">Actions</th></tr></thead>
            <tbody className="divide-y divide-white/[.05]">
              {merchants.map((merchant) => (
                <tr key={merchant.id} className="hover:bg-white/[.02]">
                  <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-700/40 text-slate-300"><UserRound size={16} /></div><div><p className="font-medium text-white">{merchant.name}</p><p className="mt-1 text-xs text-slate-500">{merchant.email} · {merchant.transactionCount} txns</p></div></div></td>
                  <td className="px-4 py-4 font-mono text-xs text-slate-300">{merchant.clientId || 'No active key'}</td>
                  <td className="px-4 py-4 text-slate-300">{(Number(merchant.agencyCommissionRate) * 100).toFixed(2)}%</td>
                  <td className="px-4 py-4"><p className="text-slate-300">{merchant.defaultPayoutProvider}</p><p className="mt-1 text-xs text-slate-500">{merchant.defaultPayoutPhone}</p></td>
                  <td className="px-4 py-4"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${merchant.status === 'ACTIVE' ? 'border-emerald-300/15 bg-emerald-400/10 text-emerald-300' : 'border-amber-300/15 bg-amber-400/10 text-amber-200'}`}>{merchant.status}</span></td>
                  <td className="px-6 py-4"><div className="flex justify-end gap-2"><button className="btn-quiet px-2.5 py-2 text-xs" onClick={() => rotateKey(merchant)} title="Rotate API credentials"><RotateCw size={14} /><span className="hidden xl:inline">Rotate</span></button><button className="btn-quiet px-2.5 py-2 text-xs" onClick={() => setMerchantStatus(merchant)}>{merchant.status === 'ACTIVE' ? <X size={14} /> : <Check size={14} />}<span className="hidden xl:inline">{merchant.status === 'ACTIVE' ? 'Suspend' : 'Activate'}</span></button></div></td>
                </tr>
              ))}
              {!merchants.length && <tr><td colSpan="6" className="px-6 py-12 text-center text-sm text-slate-500">{loading ? 'Loading merchant list…' : 'No merchant apps registered yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/[.06] px-6 py-3 text-xs text-slate-500">Updated list · latest merchant first{merchants[0] ? ` · ${formatDate(merchants[0].createdAt)}` : ''}</div>
      </section>

      {issued && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="key-title">
          <div className="glass w-full max-w-xl rounded-2xl p-6 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><KeyRound size={18} /></div><h2 id="key-title" className="text-xl font-semibold text-white">{issued.kind === 'created' ? 'Merchant credentials created' : 'API key rotated'}</h2><p className="mt-1 text-sm text-slate-400">{issued.merchantName} · copy the secret before closing.</p></div>
              <button onClick={() => setIssued(null)} className="btn-quiet border-0 p-2" aria-label="Close"><X size={17} /></button>
            </div>
            <div className="mt-6 space-y-3">
              <Credential label="X-Client-ID" value={issued.clientId} />
              <Credential label="X-Client-Secret" value={issued.clientSecret} secret />
            </div>
            <p className="mt-4 rounded-xl border border-amber-300/10 bg-amber-400/[.06] p-3 text-xs leading-5 text-amber-100/80">Save this secret in your server-side secret store. It cannot be retrieved again. {issued.kind === 'rotated' && 'The previous key was revoked immediately.'}</p>
            <div className="mt-5 flex justify-end gap-2"><button className="btn-quiet" onClick={() => setIssued(null)}>Close</button><button className="btn-primary" onClick={copyCredentials}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy credentials'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Credential({ label, value, secret = false }) {
  return <label className="block space-y-2 text-xs font-semibold text-slate-500">{label}<input className="field select-all font-mono text-xs text-indigo-100" readOnly type={secret ? 'password' : 'text'} value={value} onFocus={(e) => e.target.select()} /></label>;
}
