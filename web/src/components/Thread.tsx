'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import Composer from './Composer';

type Message = {
  id: string;
  fromName: string;
  fromEmail: string;
  sentAt: string;
  isOutbound: boolean;
  body: string;
  gmailUrl: string;
};

type Commitment = {
  id: string;
  direction: 'owed' | 'awaiting';
  what: string;
  evidence: string;
  dueAt: string | null;
  dueText: string;
  status: string;
};

type Data = { id: string; subject: string; messages: Message[]; commitments: Commitment[] };

export default function Thread({ threadId }: { threadId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/thread/${threadId}`, { credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load this thread');
      setData(body);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  // The reply goes to whoever wrote last and is not us.
  const replyTo =
    [...(data?.messages ?? [])].reverse().find((m) => !m.isOutbound)?.fromEmail ?? '';

  return (
    <>
      <header className="page-header">
        <div style={{ minWidth: 0 }}>
          <Link href="/app" className="tiny muted" style={{ textDecoration: 'none' }}>
            ← Back to inbox
          </Link>
          <h1 className="h1 pretty" style={{ fontSize: 22, marginTop: 6 }}>
            {loading ? 'Loading…' : (data?.subject || '(no subject)')}
          </h1>
        </div>
      </header>

      <section className="section" style={{ display: 'block', maxWidth: 860 }}>
        {error && (
          <div className="card card-pad" style={{ borderLeft: '3px solid var(--danger)' }}>
            <div className="small" style={{ color: 'var(--danger)', fontWeight: 600 }}>
              {error}
            </div>
            <button type="button" className="btn btn-sm mt-12" onClick={load}>
              Try again
            </button>
          </div>
        )}

        {loading && <div className="empty muted small">Fetching the thread…</div>}

        {!loading && data && (
          <div className="stack gap-16">
            {/* Commitments found in this thread, shown where the evidence is. */}
            {data.commitments.length > 0 && (
              <div className="card card-accent card-pad">
                <div className="label" style={{ color: 'var(--accent)' }}>
                  From this thread
                </div>
                <div className="stack gap-8 mt-8">
                  {data.commitments.map((row) => (
                    <div key={row.id} className="row wrap gap-8" style={{ alignItems: 'baseline' }}>
                      <span className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {row.what}
                      </span>
                      <span className="badge tiny">
                        {row.direction === 'owed' ? 'your promise' : 'their request'}
                      </span>
                      <span className="tiny muted">
                        {row.dueAt
                          ? new Date(row.dueAt).toLocaleString([], {
                              weekday: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : row.dueText || 'no deadline'}
                      </span>
                    </div>
                  ))}
                </div>
                <Link href="/app/ledger" className="btn btn-xs mt-12" style={{ textDecoration: 'none' }}>
                  Open the list
                </Link>
              </div>
            )}

            {/*
              * Reply first, thread below. By the time you have scrolled a
              * conversation you already know what you want to say.
              */}
            <Composer
              threadId={threadId}
              to={replyTo}
              subject={data.subject ?? ''}
              canDraft={Boolean(replyTo)}
              onSent={load}
            />

            {data.messages.map((message) => (
              <article
                key={message.id}
                className="card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  borderLeft: message.isOutbound ? '3px solid var(--accent)' : undefined,
                }}
              >
                <div className="card-head row wrap gap-12" style={{ justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row wrap gap-8" style={{ alignItems: 'baseline' }}>
                      <span className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {message.isOutbound ? 'You' : message.fromName || message.fromEmail}
                      </span>
                      {message.isOutbound && (
                        <span className="badge tiny" style={{ color: 'var(--accent)' }}>
                          sent
                        </span>
                      )}
                    </div>
                    <div className="mono tiny muted mt-4 truncate">{message.fromEmail}</div>
                  </div>
                  <span className="mono tiny muted">
                    {new Date(message.sentAt).toLocaleString([], {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div style={{ padding: 16 }}>
                  {/* Plain text only. Rendering sender HTML would be an XSS hole. */}
                  <p
                    className="small"
                    style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.7,
                      color: 'var(--text-body)',
                    }}
                  >
                    {message.body || '(no text content)'}
                  </p>

                  <div className="row wrap gap-8 mt-16">
                    {message.gmailUrl !== '#' && (
                      <a
                        href={message.gmailUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-ghost"
                        style={{ textDecoration: 'none' }}
                      >
                        Open in Gmail
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
