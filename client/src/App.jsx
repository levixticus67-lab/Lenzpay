import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { api } from './api.js';
import SignIn from './components/SignIn.jsx';
import Shell from './components/Shell.jsx';
import Overview from './components/Overview.jsx';
import MerchantManager from './components/MerchantManager.jsx';
import TransactionStream from './components/TransactionStream.jsx';
import ApiDocs from './components/ApiDocs.jsx';
import PayoutQueue from './components/PayoutQueue.jsx';

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState('overview');
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api('/api/admin/session')
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setChecking(false));
  }, []);

  const notify = (message, kind = 'success') => {
    setNotice({ message, kind });
    window.setTimeout(() => setNotice(null), 4200);
  };

  async function signOut() {
    try { await api('/api/admin/logout', { method: 'POST' }); } finally { setSession(null); }
  }

  if (checking) {
    return (
      <div className="app-backdrop flex min-h-screen items-center justify-center text-slate-400">
        <LoaderCircle className="mr-3 animate-spin" size={19} /> Checking secure session
      </div>
    );
  }
  if (!session) return <SignIn onSignedIn={setSession} />;

  const content = {
    overview: <Overview onNavigate={setPage} />,
    merchants: <MerchantManager notify={notify} />,
    transactions: <TransactionStream />,
    payouts: <PayoutQueue notify={notify} />,
    docs: <ApiDocs />,
  }[page];

  return (
    <Shell page={page} setPage={setPage} email={session.email} onSignOut={signOut} notice={notice}>
      {content}
    </Shell>
  );
}
