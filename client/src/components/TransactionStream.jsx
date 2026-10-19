import { useEffect, useState } from 'react';
import { Activity, RefreshCw, Search } from 'lucide-react';
import { api, formatDate, formatUgx } from '../api.js';
import { StatusBadge } from './Overview.jsx';

export default function TransactionStream() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh() {
    setError('');
    try {
      const result = await api(`/api/admin/transactions?limit=100${status ? `&status=${status}` : ''}`);
      setItems(result.transactions);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => window.clearInterval(timer);
  }, [status]);

  const visible = items.filter((item) =>
    `${item.orderId} ${item.merchantName} ${item.provider} ${item.status}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-indigo-300">Provider-confirmed activity</p><h1 className="mt-1 font-['Space_Grotesk'] text-3xl font-semibold tracking-tight text-white">Transaction stream</h1><p className="mt-2 text-sm text-slate-400">Refreshes every 8 seconds · maximum 100 most recent records.</p></div>
        <button onClick={refresh} className="btn-quiet text-xs"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-3 border-b border-white/[.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} /><input className="field pl-9 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find order, merchant, provider…" /></div>
          <div className="flex items-center gap-2"><Activity size={15} className="text-indigo-300" /><select className="field w-auto min-w-40 py-2 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="SUCCESSFUL">Successful</option><option value="FAILED">Failed</option></select></div>
        </div>
        <div className="scrollbar-soft overflow-x-auto">
          <table className="w-full min-w-[930px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-6 py-3 font-semibold">Order ID / Client app</th><th className="px-4 py-3 font-semibold">Total amount</th><th className="px-4 py-3 font-semibold">2.5% fee cut</th><th className="px-4 py-3 font-semibold">Merchant net</th><th className="px-4 py-3 font-semibold">Provider</th><th className="px-6 py-3 font-semibold">Status / Time</th></tr></thead>
            <tbody className="divide-y divide-white/[.05]">
              {visible.map((item) => (
                <tr key={item.id} className="hover:bg-white/[.02]">
                  <td className="px-6 py-4"><p className="font-medium text-slate-100">{item.orderId}</p><p className="mt-1 text-xs text-slate-500">{item.merchantName}</p></td>
                  <td className="px-4 py-4 font-semibold text-white">{formatUgx(item.totalAmount)}</td>
                  <td className="px-4 py-4 text-violet-200">{formatUgx(item.commissionAmount)}</td>
                  <td className="px-4 py-4 text-slate-300">{formatUgx(item.merchantAmount)}</td>
                  <td className="px-4 py-4"><span className="rounded-md border border-white/[.07] bg-white/[.03] px-2 py-1 text-xs text-slate-300">{item.provider}</span></td>
                  <td className="px-6 py-4"><StatusBadge status={item.status} /><p className="mt-1.5 text-[11px] text-slate-500">{formatDate(item.createdAt)}</p></td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan="6" className="px-6 py-14 text-center text-sm text-slate-500">{loading ? 'Loading transactions…' : 'No matching transactions yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/[.06] px-5 py-3 text-xs text-slate-500">Showing {visible.length} of {items.length} loaded records</div>
      </section>
    </div>
  );
}
