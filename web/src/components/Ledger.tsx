'use client';

import { useCallback, useEffect, useState } from 'react';

import { useToast } from './Shell';

/**
 * The Ledger — one list of everything you owe someone.
 *
 * An earlier version split this into two columns, "You promised" and "Waiting
 * on you". That divided the screen by where the data came from (sent mail vs
 * inbound mail), which is an implementation detail. To the reader both mean the
 * same thing — someone is waiting — so it made one question take two lists to
 * answer.
 *
 * Now: one list, ordered by how late it is. Where a row came from is a small
 * chip on the row, and a filter for anyone who wants to narrow.
 */

type Row = {
  id: string;
  direction: 'owed' | 'awaiting';
  what: string;
  counterparty: string;
  counterpartyEmail: string;
  evidence: string;
  dueAt: string | null;
  dueText: string;
  confidence: 'high' | 'low';
  status: string;
  resolvedHint: boolean;
  createdAt: string;
  state: 'overdue' | 'today' | 'upcoming' | 'undated';
  ageDays: number;
};

type Summary = {
  total: number;
  owed: number;
  awaiting: number;
  overdue: number;
  dueToday: number;
  oldestDays: number;
};

const STATE_COLOR: Record<Row['state'], string> = {
  overdue: 'var(--danger)',
  today: 'var(--warning)',
  upcoming: 'var(--accent)',
  undated: 'var(--text-faint)',
};

/** Plain language, no jargon. What a person would say out loud. */
function whenLabel(row: Row): string {
  if (row.state === 'undated') return 'No deadline given';
  if (!row.dueAt) return row.dueText || 'No deadline given';

  const due = new Date(row.dueAt);
  const time = due.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

  if (row.state === 'today') return `Due today, ${time}`;
  if (row.state === 'overdue') {
    const days = Math.max(1, Math.round((Date.now() - due.getTime()) / 86_400_000));
    return days === 1 ? 'Was due yesterday' : `${days} days late`;
  }
  return `Due ${due.toLocaleDateString([], { weekday: 'long' })}, ${time}`;
}

/** One sentence saying what this row is, in the second person. */
function reasonLabel(row: Row): string {
  return row.direction === 'owed'
    ? `You told ${row.counterparty || 'them'} you would`
    : `${row.counterparty || 'They'} asked and you haven't replied`;
}

export default function Ledger() {
  const { say } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [direction, setDirection] = useState<'all' | 'owed' | 'awaiting'>('all');
  const [showDone, setShowDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ direction, status: showDone ? 'all' : 'open' });
      const response = await fetch(`/api/commitments?${params}`, { credentials: 'include' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load your list');
      setRows(body.results);
      setSummary(body.summary);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [direction, showDone]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (id: string, status: 'done' | 'dropped' | 'open') => {
    setBusy(id);
    try {
      const response = await fetch('/api/commitments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: [id], status }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Update failed');
      say(status === 'done' ? 'Marked done' : status === 'dropped' ? 'Removed' : 'Reopened');
      await load();
    } catch (caught) {
      say((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // One sentence a person can read in half a second.
  const headline = !summary?.total
    ? "You're all clear"
    : summary.overdue
      ? `${summary.overdue} of these are already late`
      : summary.dueToday
        ? `${summary.dueToday} due today, nothing late`
        : 'Nothing late, nothing due today';

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="h1">What you owe</h1>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            Read out of your email, so you don’t have to keep a list yourself
          </p>
        </div>
        <div className="row gap-8 wrap">
          <div className="seg" role="group" aria-label="Filter">
            {(
              [
                ['all', 'Everything'],
                ['owed', 'You said you would'],
                ['awaiting', 'They asked you'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={direction === value}
                onClick={() => setDirection(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-sm"
            aria-pressed={showDone}
            onClick={() => setShowDone((value) => !value)}
          >
            {showDone ? 'Hide finished' : 'Show finished'}
          </button>
        </div>
      </header>

      {/* One number, one sentence. The whole status of your obligations. */}
      <div className="shell-pad" style={{ marginTop: 24 }}>
        <div
          className="card card-pad"
          style={{
            borderLeft: `3px solid ${summary?.overdue ? 'var(--danger)' : 'var(--success)'}`,
          }}
        >
          <div className="row gap-12 wrap" style={{ alignItems: 'baseline' }}>
            <span className="metric-number">{summary?.total ?? 0}</span>
            <span className="h2" style={{ fontSize: 16 }}>
              {summary?.total === 1 ? 'thing you owe someone' : 'things you owe people'}
            </span>
          </div>
          <div
            className="small mt-4"
            style={{ color: summary?.overdue ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}
          >
            {headline}
          </div>
          {summary && summary.oldestDays > 7 && (
            <div className="small muted mt-4">
              The oldest has been sitting for {summary.oldestDays} days.
            </div>
          )}
        </div>
      </div>

      <section className="section" style={{ display: 'block' }}>
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

        {loading && <div className="empty muted small">Reading your email…</div>}

        {!loading && !error && !rows.length && (
          <div className="card card-pad empty">
            <div className="h2" style={{ color: 'var(--text-secondary)' }}>
              Nothing outstanding
            </div>
            <div className="small muted mt-4">
              Hit Sync on the Inbox and this fills up with anything you’ve promised.
            </div>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {rows.map((row) => (
              <div key={row.id} className="ledger-row">
                <span className="ledger-rail" style={{ background: STATE_COLOR[row.state] }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Line 1: the thing, and when it is due. */}
                  <div className="row wrap gap-8" style={{ alignItems: 'baseline' }}>
                    <span className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {row.what}
                    </span>
                    <span
                      className="small"
                      style={{ fontWeight: 600, color: STATE_COLOR[row.state] }}
                    >
                      {whenLabel(row)}
                    </span>
                    {row.status !== 'open' && (
                      <span className="badge" style={{ color: 'var(--text-tertiary)' }}>
                        {row.status === 'done' ? 'done' : 'removed'}
                      </span>
                    )}
                  </div>

                  {/* Line 2: why this is on the list, in words. */}
                  <div className="row wrap gap-8 mt-4">
                    <span className="tiny muted">{reasonLabel(row)}</span>
                    <span
                      className="badge tiny"
                      style={{
                        color:
                          row.direction === 'owed' ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      {row.direction === 'owed' ? 'your promise' : 'their request'}
                    </span>
                    {row.confidence === 'low' && Boolean(row.dueText) && (
                      <span
                        className="tiny"
                        style={{ color: 'var(--warning)' }}
                        title="A deadline was mentioned but could not be pinned to a date"
                      >
                        deadline unclear
                      </span>
                    )}
                  </div>

                  {row.evidence && <div className="evidence">“{row.evidence}”</div>}

                  {row.resolvedHint && row.status === 'open' && (
                    <div className="tiny mt-8" style={{ color: 'var(--success)' }}>
                      Looks like you already did this — a later reply in the thread sounds like it.
                    </div>
                  )}

                  <div className="row wrap gap-6 mt-10">
                    {row.status === 'open' ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-xs"
                          disabled={busy === row.id}
                          onClick={() => update(row.id, 'done')}
                        >
                          Done
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          disabled={busy === row.id}
                          onClick={() => update(row.id, 'dropped')}
                          title="This isn't something you owe"
                        >
                          Not mine
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-xs"
                        disabled={busy === row.id}
                        onClick={() => update(row.id, 'open')}
                      >
                        Put back
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
