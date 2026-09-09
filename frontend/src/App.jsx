import { useState } from 'react';

import { api } from './api/client.js';
import NavRail from './components/NavRail.jsx';
import { Spinner } from './components/ui.jsx';
import { useApp } from './state/AppContext.jsx';
import BulkSendView from './views/BulkSendView.jsx';
import InboxView from './views/InboxView.jsx';
import ScheduleView from './views/ScheduleView.jsx';

export default function App() {
  const { view, account, authLoading, toast, refreshAccount } = useApp();

  if (authLoading) {
    return (
      <div className="shell" style={{ gridTemplateColumns: '1fr' }}>
        <Spinner label="Starting" />
      </div>
    );
  }

  if (!account?.authenticated) {
    return <SignedOut account={account} onSignedIn={refreshAccount} />;
  }

  return (
    <div className="shell">
      <NavRail />
      <main className="shell-main">
        {view === 'inbox' && <InboxView />}
        {view === 'schedule' && <ScheduleView />}
        {view === 'bulk' && <BulkSendView />}
      </main>
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}

function SignedOut({ account, onSignedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(account?.error || null);

  const devAvailable = account?.dev_login_available;
  const googleConfigured = account?.google_configured;

  const connect = async () => {
    setError(null);
    try {
      const { authorization_url: url } = await api.googleStart();
      window.location.href = url;
    } catch (caught) {
      setError(caught.message);
    }
  };

  const signIn = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.devLogin(username.trim(), password);
      await onSignedIn();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="shell"
      style={{ gridTemplateColumns: '1fr', placeItems: 'center', padding: 24 }}
    >
      <div className="card card-pad" style={{ maxWidth: 460, width: '100%' }}>
        <div className="row gap-12" style={{ alignItems: 'center' }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius)',
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
            }}
          >
            T
          </span>
          <h1 className="h1" style={{ fontSize: 20 }}>
            Inbox Triage
          </h1>
        </div>

        <p className="small secondary mt-16" style={{ lineHeight: 1.6 }}>
          Sign in with the Google account whose mailbox you want to triage. The app reads your mail
          and calendar to sort replies; it never sends anything on your behalf.
        </p>

        {error && (
          <div
            className="small mt-12"
            style={{ color: 'var(--danger)', fontWeight: 600 }}
            role="alert"
          >
            {error}
          </div>
        )}

        <button type="button" className="btn btn-primary btn-block mt-16" onClick={connect}>
          Continue with Google
        </button>

        {!googleConfigured && (
          <div className="tiny muted mt-8" style={{ lineHeight: 1.5 }}>
            No OAuth client configured yet — this will report that until you fill in
            <code> GOOGLE_CLIENT_ID</code> in <code>backend/.env</code>.
          </div>
        )}

        {devAvailable && (
          <>
            <div className="row gap-12 mt-20" style={{ alignItems: 'center' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--border-medium)' }} />
              <span className="label">or, for local development</span>
              <span style={{ flex: 1, height: 1, background: 'var(--border-medium)' }} />
            </div>

            <form className="stack gap-8 mt-16" onSubmit={signIn}>
              <input
                className="input"
                placeholder="Username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                aria-label="Username"
              />
              <input
                className="input"
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-label="Password"
              />
              <button
                type="submit"
                className="btn btn-block"
                disabled={busy || !username.trim() || !password}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="tiny muted mt-12" style={{ lineHeight: 1.6 }}>
              Password sign-in works only while <code>DJANGO_DEBUG</code> is on. Seed a demo
              mailbox with <code>python manage.py seed_demo</code> — the default account is{' '}
              <code>demo</code> / <code>demo</code>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
