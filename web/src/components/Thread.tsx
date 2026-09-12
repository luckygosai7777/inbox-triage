'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { useToast } from './Shell';

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

type DraftResult = {
  draft: string;
  asks: string[];
  gaps: string[];
  tells: string[];
  to: string;
  subject: string;
  voice: { measuredFrom: number; greeting: string; signOff: string; replyWords: number };
  provider: string;
};

export default function Thread({ threadId }: { threadId: string }) {
  const { say } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [draftText, setDraftText] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

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

  /**
   * Replying opens Gmail with the recipient and subject filled in. We do not
   * send — that click belongs to the user, inside Gmail.
   */
  /**
   * Ask for a draft. Nothing is sent and nothing is stored — the reply comes
   * back as text, the user edits it, and Gmail does the sending.
   */
  const writeDraft = async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const response = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ thread_id: threadId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not write a draft');
      setDraft(body);
      setDraftText(body.draft);
      if (body.voice.measuredFrom === 0) {
        say('No sent mail found yet, so this draft is not in your voice. Sync again after sending a few emails.');
      }
    } catch (caught) {
      // Kept on screen rather than announced in a toast. A toast is right for
      // "done"; it is wrong for "here is what you must go and fix", which is
      // gone before it has been read and cannot be read twice.
      setDraftError((caught as Error).message);
    } finally {
      setDrafting(false);
    }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draftText);
      say('Draft copied');
    } catch {
      say('Could not copy — select the text and copy it manually');
    }
  };

  /** Open Gmail's composer with the draft already in it. */
  const sendDraft = () => {
    if (!draft) return;
    const subject = draft.subject.startsWith('Re:') ? draft.subject : `Re: ${draft.subject}`;
    const url = `https://mail.google.com/mail/?${new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: draft.to,
      su: subject,
      body: draftText,
    })}`;
    // Very long drafts overflow what a URL can carry; copying is the reliable
    // path, and silently truncating someone's email would be much worse.
    if (url.length > 7000) {
      copyDraft();
      say('Draft copied — it was too long for a Gmail link, so paste it in');
      return;
    }
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!tab) say('Allow pop-ups to open Gmail');
  };

  const reply = (message: Message) => {
    const subject = data?.subject?.startsWith('Re:') ? data.subject : `Re: ${data?.subject ?? ''}`;
    const url = `https://mail.google.com/mail/?${new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: message.fromEmail,
      su: subject,
    })}`;
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!tab) say('Allow pop-ups to open Gmail');
  };

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
              * Drafting sits above the thread, because by the time you have
              * scrolled the whole conversation you have already decided what to
              * say. The draft is always editable and never sent from here.
              */}
            <div className="card card-pad">
              <div className="row wrap gap-12" style={{ justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="label">Reply</div>
                  <div className="small muted mt-4">
                    Written in your voice, from your own sent mail. You edit and send it.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={writeDraft}
                  disabled={drafting}
                >
                  {drafting ? 'Reading the thread…' : draft ? 'Write another' : 'Draft a reply'}
                </button>
              </div>

              {draftError && (
                <div
                  className="mt-12"
                  style={{
                    borderLeft: '3px solid var(--danger)',
                    background: 'var(--bg-stripe)',
                    borderRadius: 'var(--radius)',
                    padding: 12,
                  }}
                  role="alert"
                >
                  <div className="small" style={{ fontWeight: 600, color: 'var(--danger)' }}>
                    {draftError}
                  </div>
                  {/[Nn]o AI provider/.test(draftError) && (
                    <div className="tiny muted mt-8" style={{ lineHeight: 1.7 }}>
                      Drafting is the one feature that needs a model. Add{' '}
                      <span className="mono">GEMINI_API_KEY</span> in Vercel → Settings →
                      Environment Variables (free, from aistudio.google.com/apikey), then redeploy.
                      Sorting and the ledger keep working without it.
                    </div>
                  )}
                </div>
              )}

              {draft && (
                <div className="stack gap-12 mt-16">
                  {draft.asks.length > 0 && (
                    <div>
                      <div className="tiny muted">What they asked for</div>
                      <ul className="small mt-4" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                        {draft.asks.map((ask) => (
                          <li key={ask}>{ask}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <label className="tiny muted" htmlFor="draft-body">
                    Draft — edit anything before you send
                  </label>
                  <textarea
                    id="draft-body"
                    className="draft-box"
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    rows={Math.min(20, Math.max(6, draftText.split('\n').length + 2))}
                    spellCheck
                  />

                  {draft.gaps.length > 0 && (
                    <div
                      className="card-pad"
                      style={{
                        background: 'var(--bg-stripe)',
                        borderRadius: 'var(--radius)',
                        borderLeft: '3px solid var(--warning)',
                        padding: 12,
                      }}
                    >
                      <div className="tiny" style={{ fontWeight: 700, color: 'var(--warning)' }}>
                        Fill these in before sending
                      </div>
                      <ul className="small mt-4" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                        {draft.gaps.map((gap) => (
                          <li key={gap}>{gap}</li>
                        ))}
                      </ul>
                      <div className="tiny muted mt-8">
                        It left these blank on purpose. It does not know your prices, dates or
                        decisions, and guessing them into an email to a client is the one mistake
                        this tool must never make.
                      </div>
                    </div>
                  )}

                  {draft.tells.length > 0 && (
                    <div className="tiny" style={{ color: 'var(--warning)' }}>
                      Reads a bit generated — found {draft.tells.map((t) => `"${t}"`).join(', ')}.
                      Worth rewording.
                    </div>
                  )}

                  <div className="row wrap gap-8">
                    <button type="button" className="btn btn-primary btn-sm" onClick={sendDraft}>
                      Open in Gmail
                    </button>
                    <button type="button" className="btn btn-sm" onClick={copyDraft}>
                      Copy
                    </button>
                    <div className="spacer" />
                    <span className="tiny muted">
                      {draft.voice.measuredFrom > 0
                        ? `Voice measured from ${draft.voice.measuredFrom} of your emails${
                            draft.voice.signOff ? ` · you sign off "${draft.voice.signOff}"` : ''
                          }`
                        : 'No sent mail to learn your voice from yet'}
                    </span>
                  </div>
                </div>
              )}
            </div>

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
                    {!message.isOutbound && (
                      <button type="button" className="btn btn-sm" onClick={() => reply(message)}>
                        Reply in Gmail
                      </button>
                    )}
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
