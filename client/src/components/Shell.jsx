import { Activity, BookOpenText, CircleHelp, Command, CreditCard, LayoutDashboard, LogOut, Store, WalletCards } from 'lucide-react';

const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'merchants', label: 'Client merchants', icon: Store },
  { id: 'transactions', label: 'Transactions', icon: Activity },
  { id: 'payouts', label: 'Payouts', icon: WalletCards },
  { id: 'docs', label: 'API & playground', icon: BookOpenText },
];

export default function Shell({ page, setPage, email, onSignOut, notice, children }) {
  return (
    <div className="app-backdrop min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-64 shrink-0 border-r border-white/[.07] px-5 py-7 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 text-white shadow-glow">
              <CreditCard size={19} />
            </div>
            <div>
              <p className="font-['Space_Grotesk'] text-lg font-bold tracking-tight text-white">lenzpay</p>
              <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">Payment engine</p>
            </div>
          </div>
          <div className="mt-11 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-600">Workspace</div>
          <nav className="mt-3 space-y-1">
            {navigation.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setPage(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                  page === id
                    ? 'border border-indigo-300/15 bg-indigo-400/10 font-semibold text-indigo-100'
                    : 'text-slate-400 hover:bg-white/[.04] hover:text-slate-100'
                }`}
              >
                <Icon size={17} className={page === id ? 'text-indigo-300' : 'text-slate-500'} />
                {label}
              </button>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300"><CircleHelp size={15} className="text-indigo-300" /> Need a hand?</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Open API & playground for integration examples and payment flow details.</p>
            <button onClick={() => setPage('docs')} className="mt-3 text-xs font-semibold text-indigo-300 hover:text-indigo-200">View developer docs →</button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-white/[.07] bg-[#080b14]/75 px-5 py-4 backdrop-blur-xl sm:px-8">
            <div className="mx-auto flex max-w-[1320px] items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-400/10 text-indigo-200 lg:hidden"><Command size={17} /></div>
                <div>
                  <p className="font-['Space_Grotesk'] text-lg font-semibold text-white">{navigation.find((item) => item.id === page)?.label}</p>
                  <p className="hidden text-xs text-slate-500 sm:block">Lenzpay · Uganda · UGX</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-4">
                <span className="hidden max-w-48 truncate text-xs text-slate-400 sm:block">{email}</span>
                <button onClick={onSignOut} className="btn-quiet px-3 py-2 text-xs"><LogOut size={14} /> <span className="hidden sm:inline">Sign out</span></button>
              </div>
            </div>
            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {navigation.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setPage(id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs ${page === id ? 'bg-indigo-400/15 text-indigo-100' : 'bg-white/[.03] text-slate-400'}`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </nav>
          </header>
          <main className="mx-auto max-w-[1320px] px-5 py-7 sm:px-8 sm:py-9">{children}</main>
        </div>
      </div>
      {notice && (
        <div role="status" className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl ${
          notice.kind === 'error' ? 'border-rose-300/20 bg-rose-950/90 text-rose-100' : 'border-emerald-300/20 bg-emerald-950/90 text-emerald-100'
        }`}>{notice.message}</div>
      )}
    </div>
  );
}
