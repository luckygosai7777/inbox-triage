'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useToast } from './Shell';

import { apiFetch } from '@/lib/http';

type Account = {
  email: string;
  googleConnected: boolean;
  lastSyncedAt: string | null;
  counts: { messages: number; commitments: number; subscriptions: number };
  demo?: boolean;
};

export default function Settings() {
  const { say } = useToast();
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  const runDiagnostics = async () => {
    setChecking(true);
    try {
      const response = await apiFetch('/api/diagnostics/ai');
      // A diagnostic that cannot report its own failure is worthless, so a
      // non-JSON answer becomes a failed step rather than a thrown error.
      setDiagnostics(
        response.ok
          ? response.data
          : { ok: false, steps: [{ name: 'The check itself ran', status: 'failed', detail: response.error }] },
      );
    } catch (caught) {
      say((caught as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/account');
      if (!response.ok) throw new Error(response.error || 'Could not load your account');
      const body = response.data;
      setAccount(body);
    } catch (caught) {
      say((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [say]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    if (confirm !== 'DELETE') return;
    setDeleting(true);
    try {
      const response = await apiFetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (!response.ok) throw new Error(response.error || 'Delete failed');
      const body = response.data;
      say('Account deleted');
      router.push('/');
    } catch (caught) {
      say((caught as Error).message);
      setDeleting(false);
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="h1 rule-sweep">Settings</h1>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            Your account, your data, and how to take it back
          </p>
        </div>
      </header>

      <section className="section" style={{ display: 'block', maxWidth: 760 }}>
        {loading && <div className="empty muted small">Loading…</div>}

        {!loading && account && (
          <div className="stack gap-16">
            {account.demo && (
              <div className="card card-pad card-warning">
                <div className="small" style={{ fontWeight: 600, color: 'var(--warning)' }}>
                  Demo mode
                </div>
                <p className="small secondary mt-4">
                  You are looking at sample data. Connect a real Google account to sync your own
                  mail — see the README for setup.
                </p>
              </div>
            )}

            {/*
              * Drafting has four moving parts on a server the user cannot see,
              * and "it doesn't work" cost several rounds of guessing before
              * this existed. It walks the chain and names the step that broke.
              */}
            <div className="card card-pad">
              <div className="row wrap gap-12" style={{ justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="h3">Drafting</div>
                  <div className="small muted mt-4">
                    Checks the whole chain — key, model catalogue, and a live test request.
                  </div>
                </div>
                <button type="button" className="btn btn-sm" onClick={runDiagnostics} disabled={checking}>
                  {checking ? 'Checking…' : 'Check setup'}
                </button>
              </div>

              {diagnostics && (
                <div className="stack gap-8 mt-16">
                  {diagnostics.steps.map((step: any) => (
                    <div key={step.name} className="row gap-8" style={{ alignItems: 'flex-start' }}>
                      <span
                        aria-hidden="true"
                        style={{
                          flex: 'none',
                          marginTop: 2,
                          fontWeight: 700,
                          color:
                            step.status === 'ok'
                              ? 'var(--success)'
                              : step.status === 'failed'
                                ? 'var(--danger)'
                                : 'var(--text-faint)',
                        }}
                      >
                        {step.status === 'ok' ? '✓' : step.status === 'failed' ? '✕' : '–'}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="small" style={{ fontWeight: 600 }}>
                          {step.name}
                        </div>
                        <div className="tiny muted" style={{ lineHeight: 1.6 }}>
                          {step.detail}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* --- connection --- */}
            <div className="card card-pad">
              <div className="h3">Google account</div>
              <div className="row wrap gap-12 mt-12" style={{ justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="mono small truncate">{account.email}</div>
                  <div
                    className="tiny mt-4"
                    style={{ color: account.googleConnected ? 'var(--success)' : 'var(--warning)' }}
                  >
                    {account.googleConnected ? 'Gmail and Calendar connected' : 'Not connected'}
                  </div>
                </div>
                <div className="small muted">
                  {account.lastSyncedAt
                    ? `Last sync ${new Date(account.lastSyncedAt).toLocaleString()}`
                    : 'Never synced'}
                </div>
              </div>
              <p className="tiny muted mt-12" style={{ lineHeight: 1.6 }}>
                You can revoke our access at any time from your{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google permissions page
                </a>
                , independently of anything you do here.
              </p>
            </div>

            {/* --- what we hold --- */}
            <div className="card card-pad">
              <div className="h3">What we store</div>
              <div className="feature-grid mt-12" style={{ gap: 12 }}>
                {[
                  ['Messages', account.counts.messages],
                  ['Commitments', account.counts.commitments],
                  ['Mailing lists', account.counts.subscriptions],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius)',
                      padding: 14,
                    }}
                  >
                    <div className="label">{label}</div>
                    <div className="metric-number mt-8" style={{ fontSize: 22 }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
              <a
                href="/api/export"
                className="btn btn-sm mt-16"
                style={{ textDecoration: 'none', display: 'inline-flex' }}
              >
                Download everything (JSON)
              </a>
              <p className="tiny muted mt-8">
                Your encrypted Google token is deliberately left out of the export.
              </p>
            </div>

            {/* --- privacy summary --- */}
            <div className="card card-pad">
              <div className="h3">Privacy</div>
              <ul className="price-list mt-12">
                <li>We never send email on your behalf</li>
                <li>Your Google token is encrypted before storage</li>
                <li>Your mail is never used to train models</li>
                <li>Row-level security isolates your data in the database</li>
              </ul>
              <p className="small muted mt-12">
                Full detail in the <Link href="/privacy">privacy policy</Link> and{' '}
                <Link href="/terms">terms</Link>.
              </p>
            </div>

            {/* --- danger zone --- */}
            <div className="card card-pad" style={{ borderColor: 'var(--border-danger)' }}>
              <div className="h3" style={{ color: 'var(--danger)' }}>
                Delete account
              </div>
              <p className="small secondary mt-8" style={{ lineHeight: 1.6 }}>
                Removes every row we hold about you and revokes our access to your Google account.
                Immediate, with no retention period. Your actual Gmail is untouched — only our copy
                of the derived data is deleted.
              </p>

              <div className="row wrap gap-8 mt-16">
                <input
                  className="input input-sm"
                  style={{ maxWidth: 220 }}
                  placeholder="Type DELETE to confirm"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  aria-label="Type DELETE to confirm account deletion"
                />
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={confirm !== 'DELETE' || deleting}
                  onClick={remove}
                >
                  {deleting ? 'Deleting…' : 'Delete my account'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
