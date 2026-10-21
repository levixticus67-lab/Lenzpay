import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CircleDollarSign, Download, LoaderCircle, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { api, download, formatDate, formatUgx } from '../api.js';

const badgeStyles = {
  AWAITING_APPROVAL: 'border-amber-300/15 bg-amber-400/10 text-amber-200',
  SUBMITTING: 'border-cyan-300/15 bg-cyan-400/10 text-cyan-200',
  PENDING: 'border-indigo-300/15 bg-indigo-400/10 text-indigo-200',
  SUCCESSFUL: 'border-emerald-300/15 bg-emerald-400/10 text-emerald-300',
  FAILED: 'border-rose-300/15 bg-rose-400/10 text-rose-300',
  REVIEW_REQUIRED: 'border-orange-300/15 bg-orange-400/10 text-orange-200',
};

function maskReference(reference) {
  if (!reference) return '—';
  return `${reference.slice(0, 8)}…${reference.slice(-4)}`;
}

function PayoutBadge({ status }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeStyles[status] || 'border-white/10 bg-white/5 text-slate-300'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status.replaceAll('_', ' ')}</span>;
}

export default function PayoutQueue({ notify }) {
  const [items, setItems] = useState([]);
  const [enabled, setEnabled] = useState({ MTN: false, AIRTEL: false });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [confirmationReference, setConfirmationReference] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [resolutionStatus, setResolutionStatus] = useState('SUCCESSFUL');

  async function refresh() {
    setError('');
    try {
      const query = status ? `?limit=200&status=${status}` : '?limit=200';
      const result = await api(`/api/admin/payouts${query}`);
      setItems(result.payouts);
      setEnabled(result.disbursementApiEnabled);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => window.clearInterval(timer);
  }, [status]);

  function openAction(item, mode) {
    setTarget({ ...item, mode });
    setAcknowledged(false);
    setConfirmationReference('');
    setResolutionStatus('SUCCESSFUL');
  }

  async function completeAction(event) {
    event.preventDefault();
    if (!target || !acknowledged) return;
    setBusy(true);
    setError('');
    try {
      if (target.mode === 'provider') {
        const result = await api(`/api/admin/payouts/${target.id}/submit`, { method: 'POST' });
        notify(`Transfer request sent · ${result.payout.status.toLowerCase().replaceAll('_', ' ')}`);
      } else {
        const endpoint = target.mode === 'resolve' ? 'resolve-manual' : 'confirm-manual';
        const payload = target.mode === 'resolve'
          ? { confirmationReference, status: resolutionStatus }
          : { confirmationReference };
        const result = await api(`/api/admin/payouts/${target.id}/${endpoint}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify(`Portal result recorded · ${result.payout.status.toLowerCase()}`);
      }
      setTarget(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportQueue() {
    try {
      await download('/api/admin/payouts/export.csv', 'lenzpay-payout-instructions-internal.csv');
    } catch (err) {
      setError(err.message);
    }
  }

  const waiting = items.filter((item) => item.status === 'AWAITING_APPROVAL').length;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-indigo-300">Two ledger lines per successful collection</p>
          <h1 className="mt-1 font-['Space_Grotesk'] text-3xl font-semibold tracking-tight text-white">Payout queue</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Successful collections create payout instructions; no money moves automatically. A provider transfer requires an explicit confirmation below. Provider acceptance is not final settlement.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportQueue} className="btn-quiet text-xs"><Download size={14} /> Export internal CSV</button>
          <button onClick={refresh} className="btn-quiet text-xs"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-amber-200/10 bg-amber-400/10 p-2.5 text-amber-200"><CircleDollarSign size={18} /></div>
            <div><p className="text-sm text-slate-400">Awaiting operator action</p><p className="mt-1 text-2xl font-semibold text-white">{waiting}</p></div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">The export is an internal review file, not a provider upload template. Use the provider-issued bulk-payment form if your contract requires one.</p>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-indigo-200/10 bg-indigo-400/10 p-2.5 text-indigo-200"><ShieldCheck size={18} /></div>
            <div><p className="text-sm text-slate-400">Provider API controls</p><p className="mt-1 text-sm font-semibold text-white">MTN: {enabled.MTN ? 'enabled' : 'off'} <span className="mx-1 text-slate-600">·</span> Airtel: {enabled.AIRTEL ? 'enabled' : 'off'}</p></div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Direct transfer APIs stay disabled until the provider approves the product and the required secrets are configured in Render.</p>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-3 border-b border-white/[.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2 text-sm text-slate-300"><CircleDollarSign size={15} className="text-indigo-300" /> Individual payout instructions</div>
          <select className="field w-auto min-w-48 py-2 text-xs" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="AWAITING_APPROVAL">Awaiting approval</option>
            <option value="SUBMITTING">Submitting</option>
            <option value="PENDING">Pending</option>
            <option value="SUCCESSFUL">Successful</option>
            <option value="FAILED">Failed</option>
            <option value="REVIEW_REQUIRED">Review required</option>
          </select>
        </div>
        <div className="scrollbar-soft overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3 font-semibold">Order / Client</th><th className="px-4 py-3 font-semibold">Split line</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Wallet</th><th className="px-4 py-3 font-semibold">Provider / Ref</th><th className="px-4 py-3 font-semibold">Status / time</th><th className="px-5 py-3 font-semibold">Action</th></tr></thead>
            <tbody className="divide-y divide-white/[.05]">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-white/[.02]">
                  <td className="px-5 py-4"><p className="font-medium text-slate-100">{item.orderId}</p><p className="mt-1 text-xs text-slate-500">{item.merchantName}</p></td>
                  <td className="px-4 py-4 text-xs text-slate-300">{item.kind === 'AGENCY_COMMISSION' ? 'Agency fee' : 'Merchant net'}</td>
                  <td className="px-4 py-4 font-semibold text-white">{formatUgx(item.amount)}</td>
                  <td className="px-4 py-4 font-mono text-xs text-slate-400">{item.destinationMasked}</td>
                  <td className="px-4 py-4"><p className="text-xs text-slate-200">{item.provider}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{maskReference(item.providerReference)}</p></td>
                  <td className="px-4 py-4"><PayoutBadge status={item.status} /><p className="mt-1.5 text-[11px] text-slate-500">{formatDate(item.submittedAt || item.createdAt)}</p></td>
                  <td className="px-5 py-4">
                    {item.status === 'AWAITING_APPROVAL' && enabled[item.provider] && (
                      <button onClick={() => openAction(item, 'provider')} className="btn-primary whitespace-nowrap px-3 py-2 text-xs"><Send size={13} /> Review transfer</button>
                    )}
                    {item.status === 'AWAITING_APPROVAL' && !enabled[item.provider] && (
                      <button onClick={() => openAction(item, 'manual')} className="btn-quiet whitespace-nowrap px-3 py-2 text-xs"><Check size={13} /> Record portal payout</button>
                    )}
                    {(item.status === 'FAILED' || item.status === 'REVIEW_REQUIRED' ||
                      (item.status === 'PENDING' && Date.now() - new Date(item.submittedAt || item.createdAt).getTime() > 15 * 60 * 1000)) && (
                      <button onClick={() => openAction(item, 'resolve')} className="btn-quiet whitespace-nowrap px-3 py-2 text-xs"><ShieldCheck size={13} /> Resolve from portal</button>
                    )}
                    {item.status === 'REVIEW_REQUIRED' && <span className="inline-flex items-center gap-1 text-xs text-orange-200"><AlertTriangle size={13} /> Investigate</span>}
                    {['SUBMITTING', 'PENDING'].includes(item.status) && <span className="inline-flex items-center gap-1 text-xs text-indigo-200"><LoaderCircle size={13} className="animate-spin" /> Checking</span>}
                    {['SUCCESSFUL', 'FAILED'].includes(item.status) && <span className="text-xs text-slate-500">Closed</span>}
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan="7" className="px-6 py-14 text-center text-sm text-slate-500">{loading ? 'Loading payout instructions…' : 'No payout instructions match this filter.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/[.06] px-5 py-3 text-xs text-slate-500">Showing {items.length} records · auto-refreshes every 10 seconds</div>
      </section>

      {target && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setTarget(null); }}>
          <form onSubmit={completeAction} className="glass w-full max-w-lg rounded-2xl border border-white/10 p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <div className={`rounded-xl border p-2.5 ${target.mode === 'provider' ? 'border-rose-200/10 bg-rose-400/10 text-rose-200' : 'border-amber-200/10 bg-amber-400/10 text-amber-200'}`}>
                {target.mode === 'provider' ? <Send size={18} /> : <Check size={18} />}
              </div>
              <div><h2 className="font-['Space_Grotesk'] text-xl font-semibold text-white">{target.mode === 'provider' ? 'Submit provider transfer?' : target.mode === 'resolve' ? 'Resolve from provider portal?' : 'Record a completed portal payout?'}</h2><p className="mt-1 text-sm leading-6 text-slate-400">{target.mode === 'provider' ? 'Confirming sends a real wallet transfer. A network timeout is not retried automatically.' : target.mode === 'resolve' ? 'Check this transaction in the provider portal before recording its final result. Do not initiate another transfer while the existing result is unknown.' : 'Only continue after you have completed the transfer in the provider portal and checked its final successful result.'}</p></div>
            </div>
            <div className="my-5 grid grid-cols-2 gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-4 text-sm">
              <div><p className="text-xs text-slate-500">Wallet provider</p><p className="mt-1 font-semibold text-slate-100">{target.provider}</p></div>
              <div><p className="text-xs text-slate-500">Amount</p><p className="mt-1 font-semibold text-white">{formatUgx(target.amount)}</p></div>
              <div><p className="text-xs text-slate-500">Recipient</p><p className="mt-1 font-mono text-xs text-slate-200">{target.destinationMasked}</p></div>
              <div><p className="text-xs text-slate-500">Order / split</p><p className="mt-1 truncate text-xs text-slate-200">{target.orderId} · {target.kind === 'AGENCY_COMMISSION' ? 'fee' : 'merchant net'}</p></div>
            </div>
            {target.mode === 'resolve' && <label className="mb-4 block"><span className="mb-1.5 block text-xs font-medium text-slate-300">Final provider portal status</span><select className="field" value={resolutionStatus} onChange={(event) => setResolutionStatus(event.target.value)}><option value="SUCCESSFUL">Successful</option><option value="FAILED">Failed</option></select></label>}
            {target.mode === 'manual' && <label className="mb-4 block"><span className="mb-1.5 block text-xs font-medium text-slate-300">Provider portal confirmation reference</span><input className="field" required minLength={4} maxLength={120} value={confirmationReference} onChange={(event) => setConfirmationReference(event.target.value)} placeholder="Receipt or transfer reference" /></label>}
            {target.mode === 'resolve' && <label className="mb-4 block"><span className="mb-1.5 block text-xs font-medium text-slate-300">Provider portal confirmation reference</span><input className="field" required minLength={4} maxLength={120} value={confirmationReference} onChange={(event) => setConfirmationReference(event.target.value)} placeholder="Receipt or status lookup reference" /></label>}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-xs leading-5 text-slate-300">
              <input className="mt-1 accent-indigo-400" type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              <span>{target.mode === 'provider' ? 'I reviewed the provider, wallet, and amount. I understand this confirmation requests an actual money transfer.' : target.mode === 'resolve' ? 'I verified the final status against the provider portal and understand this dashboard record is operator-entered, not API-verified.' : 'I personally verified the successful transfer in the provider portal. This dashboard record is operator-entered and not independently API-verified.'}</span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-quiet text-xs" disabled={busy} onClick={() => setTarget(null)}>Cancel</button>
              <button type="submit" disabled={busy || !acknowledged || (target.mode === 'manual' && confirmationReference.trim().length < 4)} className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? <LoaderCircle size={14} className="animate-spin" /> : target.mode === 'provider' ? <Send size={14} /> : <Check size={14} />}
                {busy ? 'Saving…' : target.mode === 'provider' ? 'Send real transfer' : target.mode === 'resolve' ? 'Record portal result' : 'Record success'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
