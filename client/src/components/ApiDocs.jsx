import { useMemo, useState } from 'react';
import { Check, Clipboard, Code2, ExternalLink, ShieldAlert, TerminalSquare } from 'lucide-react';

const examples = {
  'Node.js': ({ orderId, amount, phone, provider }) => `// Run this on your server, never in a browser bundle.
const response = await fetch(\`\${process.env.LENZPAY_API_URL}/api/v1/payments/checkout\`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Client-ID": process.env.LENZPAY_CLIENT_ID,
    "X-Client-Secret": process.env.LENZPAY_CLIENT_SECRET
  },
  body: JSON.stringify({
    amount: ${amount},
    payerPhone: ${JSON.stringify(phone)},
    provider: "${provider}",
    orderId: ${JSON.stringify(orderId)}
  })
});
const payment = await response.json(); // 202 = collection pending
console.log(payment.transactionId, payment.status);`,
  Fetch: ({ orderId, amount, phone, provider }) => `const checkoutResponse = await fetch(
  \`\${LENZPAY_API_URL}/api/v1/payments/checkout\`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-ID": process.env.LENZPAY_CLIENT_ID,
      "X-Client-Secret": process.env.LENZPAY_CLIENT_SECRET
    },
    body: JSON.stringify({
      amount: ${amount},
      payerPhone: ${JSON.stringify(phone)},
      provider: "${provider}",
      orderId: ${JSON.stringify(orderId)}
    })
  }
);
const result = await checkoutResponse.json();`,
  React: ({ orderId, amount, phone, provider }) => `// Call your own backend route from React. Keep Lenzpay
// credentials on that server; never put them in VITE_ variables.
async function startCheckout() {
  return fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: ${amount},
      payerPhone: ${JSON.stringify(phone)},
      provider: "${provider}",
      orderId: ${JSON.stringify(orderId)}
    })
  }).then((response) => response.json());
}`,
};

export default function ApiDocs() {
  const [language, setLanguage] = useState('Node.js');
  const [orderId, setOrderId] = useState('order_2026_001');
  const [amount, setAmount] = useState('25000');
  const [phone, setPhone] = useState('+256772123456');
  const [provider, setProvider] = useState('MTN');
  const [copied, setCopied] = useState(false);
  const snippet = useMemo(() => examples[language]({ orderId, amount: Number(amount) || 0, phone, provider }), [language, orderId, amount, phone, provider]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-medium text-indigo-300">For builders</p>
        <h1 className="mt-1 font-['Space_Grotesk'] text-3xl font-semibold tracking-tight text-white">API & playground</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Explore the server-side checkout request, tune a sample payload, and copy an integration snippet. The playground previews code; it does not initiate a real charge.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
        <section className="glass rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-3"><div className="rounded-xl border border-indigo-200/10 bg-indigo-400/10 p-2.5 text-indigo-300"><TerminalSquare size={18} /></div><div><h2 className="font-semibold text-white">Request builder</h2><p className="text-xs text-slate-500">Adjust the values; snippets update live.</p></div></div>
          <div className="mt-6 space-y-4">
            <label className="block space-y-2 text-xs font-medium text-slate-400">Order ID<input className="field font-mono text-sm" value={orderId} onChange={(e) => setOrderId(e.target.value)} maxLength="80" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2 text-xs font-medium text-slate-400">Amount (UGX)<input className="field" type="number" min="100" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              <label className="block space-y-2 text-xs font-medium text-slate-400">Provider<select className="field" value={provider} onChange={(e) => setProvider(e.target.value)}><option>MTN</option><option>AIRTEL</option></select></label>
            </div>
            <label className="block space-y-2 text-xs font-medium text-slate-400">Payer phone<input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <div className="rounded-xl border border-amber-300/10 bg-amber-400/[.06] p-3 text-xs leading-5 text-amber-100/80"><ShieldAlert size={14} className="mr-1 inline" />Credentials are shown as server environment-variable names only. Do not expose client secrets in frontend JavaScript.</div>
          </div>
        </section>

        <section className="glass overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.07] px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><Code2 size={16} className="text-indigo-300" /> Checkout snippet</div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-white/[.08] bg-black/20 p-1">
                {Object.keys(examples).map((name) => <button key={name} onClick={() => setLanguage(name)} className={`rounded-md px-2.5 py-1.5 text-[11px] ${language === name ? 'bg-indigo-400/15 font-semibold text-indigo-100' : 'text-slate-500 hover:text-slate-300'}`}>{name}</button>)}
              </div>
              <button onClick={copy} className="btn-quiet px-2.5 py-2 text-xs" title="Copy snippet">{copied ? <Check size={14} /> : <Clipboard size={14} />}<span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span></button>
            </div>
          </div>
          <pre className="scrollbar-soft min-h-[360px] overflow-auto p-5 text-xs leading-6 text-indigo-100/90 sm:p-6"><code>{snippet}</code></pre>
        </section>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <InfoCard number="01" title="Start collection" body="POST /api/v1/payments/checkout creates a PENDING record before asking MTN or Airtel to collect. It returns HTTP 202 while the payer approves on their phone." />
        <InfoCard number="02" title="Verify callback" body="POST /api/v1/payments/webhook/{mtn|airtel} treats callbacks as hints and looks up the transaction directly with the provider before changing status." />
        <InfoCard number="03" title="Ledger the split" body="A verified success creates one commission entry and one merchant-net entry in a database transaction. These entries are accounting records, not telecom payouts." />
      </section>
      <p className="flex items-center gap-2 text-xs leading-5 text-slate-500"><ExternalLink size={14} className="shrink-0" />Provider collection credentials, callback registration, settlement setup, and production certification must be completed with MTN MoMo and Airtel before live traffic.</p>
    </div>
  );
}

function InfoCard({ number, title, body }) {
  return <article className="glass rounded-2xl p-5"><p className="font-mono text-xs text-indigo-300">{number}</p><h3 className="mt-3 font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></article>;
}
