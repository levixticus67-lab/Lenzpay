import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleDollarSign, Radio, RefreshCw, Store, Wallet, WalletCards } from 'lucide-react';
import { api, formatDate, formatUgx } from '../api.js';

function StatCard({ label, value, detail, icon: Icon, tone = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-400/10 text-indigo-300 border-indigo-200/10',
    violet: 'bg-violet-400/10 text-violet-300 border-violet-200/10',
    cyan: 'bg-cyan-400/10 text-cyan-300 border-cyan-200/10',
    emerald: 'bg-emerald-400/10 text-emerald-300 border-emerald-200/10',
  };
  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-3 font-['Space_Grotesk'] text-2xl font-semibold tracking-tight text-white sm:text-3xl">{value}</p>
        </div>
        <div className={`rounded-xl border p-2.5 ${colors[tone]}`}><Icon size={18} /></div>
      </div>
      <p className="mt-4 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export default function Overview({ onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setError('');
    try {
      const [overview, recent] = await Promise.all([
        api('/api/admin/overview'),
        api('/api/admin/transactions?limit=6'),
      ]);
      setSummary(overview);
      setTransactions(recent.transactions);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 12000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-indigo-300">Live operations</p>
          <h1 className="mt-1 font-['Space_Grotesk'] text-3xl font-semibold tracking-tight text-white">Payment overview</h1>
          <p className="mt-2 text-sm text-slate-400">Your merchant activity and commission ledger at a glance.</p>
        </div>
        <button onClick={refresh} className="btn-quiet text-xs"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>
      {error && <div className="rounded-xl border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Successful volume" value={formatUgx(summary?.totalVolume)} detail="Confirmed payments only" icon={CircleDollarSign} tone="indigo" />
        <StatCard label="Agency commission" value={formatUgx(summary?.totalCommissions)} detail="Ledgered commission entries" icon={Wallet} tone="violet" />
        <StatCard label="Active merchants" value={summary?.activeMerchants ?? '—'} detail="Enabled to accept checkout requests" icon={Store} tone="cyan" />
        <StatCard label="All transactions" value={summary?.transactionCount ?? '—'} detail="Pending, successful, and failed" icon={Radio} tone="emerald" />
        <StatCard label="Open payouts" value={summary?.openPayouts ?? '—'} detail="Instructions not yet settled" icon={WalletCards} tone="cyan" />
      </section>

      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold text-white">Recent transactions</h2>
            <p className="mt-1 text-xs text-slate-500">Latest provider-confirmed checkout activity</p>
          </div>
          <button onClick={() => onNavigate('transactions')} className="flex items-center gap-1 text-xs font-semibold text-indigo-300 hover:text-indigo-200">View stream <ArrowRight size={14} /></button>
        </div>
        <div className="scrollbar-soft overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-6 py-3 font-semibold">Order / Client</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Fee cut</th><th className="px-4 py-3 font-semibold">Provider</th><th className="px-6 py-3 font-semibold">Status</th></tr></thead>
            <tbody className="divide-y divide-white/[.05]">
              {transactions.map((item) => <TransactionRow key={item.id} item={item} />)}
              {!transactions.length && <tr><td colSpan="5" className="px-6 py-12 text-center text-sm text-slate-500">{loading ? 'Loading activity…' : 'No transactions yet. Your first checkout will appear here.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <button onClick={() => onNavigate('merchants')} className="glass group rounded-2xl p-5 text-left transition hover:border-indigo-300/20 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="rounded-xl border border-indigo-200/10 bg-indigo-400/10 p-2.5 text-indigo-300"><Store size={18} /></div>
            <ArrowUpRight size={17} className="text-slate-500 transition group-hover:text-indigo-300" />
          </div>
          <h3 className="mt-4 font-semibold text-white">Connect a client app</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">Register a merchant and issue its API credentials. Secrets are revealed once.</p>
        </button>
        <button onClick={() => onNavigate('docs')} className="glass group rounded-2xl p-5 text-left transition hover:border-violet-300/20 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="rounded-xl border border-violet-200/10 bg-violet-400/10 p-2.5 text-violet-300"><ArrowDownRight size={18} /></div>
            <ArrowUpRight size={17} className="text-slate-500 transition group-hover:text-violet-300" />
          </div>
          <h3 className="mt-4 font-semibold text-white">Integrate checkout</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">Copy server-side examples and see the request, callback, and ledger flow.</p>
        </button>
      </section>
    </div>
  );
}

export function StatusBadge({ status }) {
  const style = {
    SUCCESSFUL: 'border-emerald-300/15 bg-emerald-400/10 text-emerald-300',
    PENDING: 'border-amber-300/15 bg-amber-400/10 text-amber-200',
    FAILED: 'border-rose-300/15 bg-rose-400/10 text-rose-300',
  }[status] || 'border-white/10 bg-white/5 text-slate-300';
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status}</span>;
}

function TransactionRow({ item }) {
  return (
    <tr className="hover:bg-white/[.02]">
      <td className="px-6 py-3.5"><p className="font-medium text-slate-200">{item.orderId}</p><p className="mt-1 text-xs text-slate-500">{item.merchantName} · {formatDate(item.createdAt)}</p></td>
      <td className="px-4 py-3.5 font-medium text-white">{formatUgx(item.totalAmount)}</td>
      <td className="px-4 py-3.5 text-slate-300">{formatUgx(item.commissionAmount)}</td>
      <td className="px-4 py-3.5"><span className="rounded-md bg-white/[.05] px-2 py-1 text-xs text-slate-300">{item.provider}</span></td>
      <td className="px-6 py-3.5"><StatusBadge status={item.status} /></td>
    </tr>
  );
}
