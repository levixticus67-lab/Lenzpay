import { useState } from 'react';
import { ArrowRight, Fingerprint, LockKeyhole } from 'lucide-react';
import { api } from '../api.js';

export default function SignIn({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const signedIn = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      onSignedIn(signedIn);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  return (
    <main className="app-backdrop flex min-h-screen items-center justify-center px-5 py-12">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[100px]" />
      <section className="glass relative w-full max-w-md rounded-3xl p-8 shadow-glow sm:p-10">
        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-300/20 bg-indigo-400/10 text-indigo-200">
          <Fingerprint size={24} />
        </div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[.22em] text-indigo-300">Lenzpay Console</p>
        <h1 className="font-['Space_Grotesk'] text-3xl font-semibold tracking-tight text-white">Welcome back</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">Sign in to manage merchant connections and payment activity.</p>
        <form className="mt-8 space-y-4" onSubmit={submit}>
          <label className="block space-y-2 text-sm text-slate-300">
            Admin email
            <input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block space-y-2 text-sm text-slate-300">
            Password
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input className="field pl-10" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </label>
          {error && <p role="alert" className="rounded-xl border border-rose-300/15 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          <button className="btn-primary mt-2 w-full" disabled={busy}>
            {busy ? 'Signing in…' : <>Open dashboard <ArrowRight size={16} /></>}
          </button>
        </form>
        <p className="mt-6 text-xs leading-5 text-slate-500">Admin credentials are configured on the API service. This dashboard never stores the password.</p>
      </section>
    </main>
  );
}
