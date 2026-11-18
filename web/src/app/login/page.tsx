'use client';

import { useState } from 'react';

/**
 * Sign-in. The button hands over to /auth/google, which runs the Google flow
 * on our own domain (scopes and the reason for that live in lib/oauth.ts).
 */

/**
 * Is Supabase configured? These are inlined at build time, so an unconfigured
 * deploy has them as empty strings rather than undefined.
 */
const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('error'),
  );

  const signIn = () => {
    setBusy(true);
    setError(null);
    window.location.assign('/auth/google');
  };

  return (
    <div className="shell" style={{ gridTemplateColumns: '1fr', placeItems: 'center', padding: 24 }}>
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
            O
          </span>
          <h1 className="h1" style={{ fontSize: 20 }}>
            Owed
          </h1>
        </div>

        <p className="small secondary mt-16" style={{ lineHeight: 1.6 }}>
          Know what you owe, to whom, and by when — and whether today actually has room for it.
        </p>

        <ul className="small secondary" style={{ lineHeight: 1.8, paddingLeft: 18, marginTop: 12 }}>
          <li>Reads your sent mail to find promises you made</li>
          <li>Packs replies into the real gaps between your meetings</li>
          <li>Nothing sends itself: mail leaves only when you press Send</li>
        </ul>

        {error && (
          <div className="small mt-16" style={{ color: 'var(--danger)', fontWeight: 600 }} role="alert">
            {error}
          </div>
        )}

        {CONFIGURED ? (
          <button
            type="button"
            className="btn btn-primary btn-block mt-16"
            onClick={signIn}
            disabled={busy}
          >
            {busy ? 'Redirecting…' : 'Continue with Google'}
          </button>
        ) : (
          <div className="card card-pad card-warning mt-16">
            <div className="small" style={{ fontWeight: 600, color: 'var(--warning)' }}>
              Sign-in isn’t connected yet
            </div>
            <p className="small secondary mt-8" style={{ lineHeight: 1.6 }}>
              This deploy has no database attached. The next setup step is creating a Supabase
              project and adding <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to the environment variables, then
              redeploying.
            </p>
          </div>
        )}

        <p className="tiny muted mt-16" style={{ lineHeight: 1.6 }}>
          We ask for mail and calendar access so the app can read what you owe and when you are
          free. Your Google refresh token is encrypted before storage, and every row in the
          database is protected by row-level security keyed to your account.
        </p>
      </div>
    </div>
  );
}
