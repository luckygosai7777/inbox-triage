'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { useToast } from './Shell';

type Row = {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  preview: string;
  category: string;
  priority: number;
  sentAt: string;
  isVip: boolean;
  showAddress: boolean;
  effortMinutes: number;
  threadId: string;
};

const PRIORITY = [
  { label: 'Urgent', color: 'var(--danger)' },
  { label: 'Soon', color: 'var(--warning)' },
  { label: 'Later', color: 'var(--text-tertiary)' },
];

const GRID = {
  xxs: '20px 14px minmax(110px, 1fr) minmax(32px, 40px)',
  xs: '20px 14px minmax(64px, 1fr) minmax(120px, 2fr) minmax(32px, 40px)',
  sm: '20px minmax(56px, 72px) minmax(80px, 1fr) minmax(130px, 2.4fr) minmax(36px, 48px)',
  lg: '20px minmax(56px, 76px) minmax(80px, 1fr) minmax(120px, 2.6fr) minmax(0, 0.9fr) minmax(36px, 48px)',
};

function useTier() {
  const [width, setWidth] = useState(1440);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  if (width < 440) return 'xxs' as const;
  if (width < 620) return 'xs' as const;
  if (width < 900) return 'sm' as const;
  return 'lg' as const;
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfToday.getTime() - thatDay.getTime()) / 86400000);
  if (days <= 0) return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (days === 1) return 'Yest';
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export default function Inbox() {
  const { say } = useToast();
  const tier = useTier();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [data, setData] = useState<{ results: Row[]; count: number; filters: any[] }>({
    results: [],
    count: 0,
    filters: [],
  });
  const [ledger, setLedger] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(query);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ filter, search: debounced });
      const [mailRes, ledgerRes] = await Promise.all([
        fetch(`/api/mail?${params}`, { credentials: 'include' }),
        fetch('/api/commitments?limit=1', { credentials: 'include' }),
      ]);
      const mail = await mailRes.json();
      if (!mailRes.ok) throw new Error(mail.error ?? 'Could not load mail');
      setData(mail);
      if (ledgerRes.ok) setLedger((await ledgerRes.json()).summary);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = /input|textarea/i.test(target.tagName ?? '');
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && typing) {
        setQuery('');
        target.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Sync failed');
      say(
        `Synced ${body.fetched} messages · ${body.classified} classified · ${body.commitments} commitments found`,
      );
      await load();
    } catch (caught) {
      say((caught as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const columns = GRID[tier];
  const showCategory = tier === 'lg';
  const showSender = tier !== 'xxs';
  const showPriorityLabel = tier === 'sm' || tier === 'lg';

  const needsReply = useMemo(
    () => data.filters.find((f) => f.label === 'Needs reply')?.count ?? 0,
    [data.filters],
  );

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="h1">Inbox</h1>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            Sorted by reply priority
          </p>
        </div>
        <div className="row gap-8 wrap">
          <button type="button" className="btn" onClick={sync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync Gmail'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setFilter('Needs reply')}
          >
            Start triage
            <span className="mono" style={{ fontSize: 11, opacity: 0.6 }}>
              {needsReply}
            </span>
          </button>
        </div>
      </header>

      {/* The Ledger is the reason to open this app, so the inbox leads with it. */}
      {ledger && ledger.total > 0 && (
        <div className="shell-pad" style={{ marginTop: 24 }}>
          <Link href="/app/ledger" style={{ textDecoration: 'none' }}>
            <div
              className="card card-pad"
              style={{
                borderLeft: `3px solid ${ledger.overdue ? 'var(--danger)' : 'var(--accent)'}`,
              }}
            >
              <div className="row wrap gap-16" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="label" style={{ color: ledger.overdue ? 'var(--danger)' : 'var(--accent)' }}>
                    What you owe
                  </div>
                  <div className="h2 mt-4">
                    {ledger.total} {ledger.total === 1 ? 'thing' : 'things'} you owe people
                  </div>
                  <div
                    className="small mt-4"
                    style={{ color: ledger.overdue ? 'var(--danger)' : 'var(--text-tertiary)' }}
                  >
                    {ledger.overdue
                      ? `${ledger.overdue} already late`
                      : 'Nothing late right now'}
                    {ledger.oldestDays > 7 ? ` · oldest is ${ledger.oldestDays} days old` : ''}
                  </div>
                </div>
                <span className="btn btn-sm" style={{ alignSelf: 'center' }}>
                  See the list
                </span>
              </div>
            </div>
          </Link>
        </div>
      )}

      <section className="section">
        <div className="col-main card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="row gap-8" style={{ padding: '16px 16px 0' }}>
            <div className="search-shell">
              <span
                aria-hidden="true"
                style={{
                  width: 12,
                  height: 12,
                  border: '1.5px solid var(--text-tertiary)',
                  borderRadius: '50%',
                  flex: 'none',
                }}
              />
              <input
                ref={searchRef}
                className="search-input"
                type="search"
                placeholder="Search people, addresses, or topics — press /"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search mail"
              />
            </div>
          </div>

          <div
            className="row wrap gap-8"
            style={{ padding: '12px 16px 16px', borderBottom: '1px solid var(--border-light)' }}
          >
            {data.filters.map((item: any) => (
              <button
                key={item.label}
                type="button"
                className="chip"
                aria-pressed={filter === item.label}
                onClick={() => setFilter(item.label)}
              >
                {item.label}
                <span className="chip-count">{item.count}</span>
              </button>
            ))}
            <div className="spacer" />
            <div className="mono muted">{data.count} shown</div>
          </div>

          {error && (
            <div style={{ padding: 16 }}>
              <div className="small" style={{ color: 'var(--danger)', fontWeight: 600 }}>
                {error}
              </div>
              <button type="button" className="btn btn-sm mt-12" onClick={load}>
                Try again
              </button>
            </div>
          )}

          {loading && <div className="empty muted small">Loading mail…</div>}

          {!loading && !error && !data.results.length && (
            <div className="empty">
              <div className="h2" style={{ color: 'var(--text-secondary)' }}>
                {debounced ? 'No matches' : 'Nothing here yet'}
              </div>
              <div className="small muted mt-4">
                {debounced
                  ? 'Try a sender, an address, or a topic like “invoice”.'
                  : 'Hit Sync Gmail to pull your mailbox in.'}
              </div>
            </div>
          )}

          {!loading && !error && data.results.length > 0 && (
            <div role="table" aria-label="Messages">
              <div className="mail-head label" style={{ gridTemplateColumns: columns }} role="row">
                <span />
                {showPriorityLabel ? <div>Priority</div> : <div><span className="sr-only">Priority</span></div>}
                {showSender && <div>From</div>}
                <div>Subject</div>
                {showCategory && <div>Category</div>}
                <div style={{ textAlign: 'right' }}>Time</div>
              </div>

              {data.results.map((row) => (
                <MailRow
                  key={row.id}
                  row={row}
                  columns={columns}
                  showSender={showSender}
                  showCategory={showCategory}
                  showPriorityLabel={showPriorityLabel}
                  stackSender={tier === 'xxs'}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/**
 * Memoised: the list re-renders on every keystroke while searching, and rows
 * that did not change should not re-render with it.
 */
const MailRow = memo(function MailRow({
  row,
  columns,
  showSender,
  showCategory,
  showPriorityLabel,
  stackSender,
}: {
  row: Row;
  columns: string;
  showSender: boolean;
  showCategory: boolean;
  showPriorityLabel: boolean;
  stackSender: boolean;
}) {
  const priority = PRIORITY[row.priority] ?? PRIORITY[2];
  return (
    <Link
      href={`/app/thread/${row.threadId}`}
      className="mail-row"
      style={{ gridTemplateColumns: columns, textDecoration: 'none', color: 'inherit' }}
      role="row"
    >
      <span />
      <div className="row gap-6">
        <span className="prio-dot" style={{ background: priority.color }} />
        {showPriorityLabel && (
          <span className="small" style={{ fontWeight: 600, color: priority.color }}>
            {priority.label}
          </span>
        )}
      </div>

      {showSender && (
        <div className="row gap-6" style={{ minWidth: 0 }}>
          {row.isVip && (
            <span className="tiny" style={{ flex: 'none', color: 'var(--accent)' }} title="Important person">
              ★
            </span>
          )}
          <span
            className="truncate small"
            style={{ fontWeight: 500, color: row.isVip ? 'var(--text-primary)' : 'var(--text-body)' }}
          >
            {row.fromName || row.fromEmail}
          </span>
        </div>
      )}

      <div style={{ minWidth: 0 }}>
        {stackSender && (
          <div className="truncate small" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            {row.fromName || row.fromEmail}
          </div>
        )}
        <div className="truncate small" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
          {row.subject || '(no subject)'}
        </div>
        {row.showAddress && (
          <div className="truncate mono tiny" style={{ color: 'var(--accent)', marginTop: 2 }}>
            {row.fromEmail}
          </div>
        )}
        {row.preview && (
          <div className="truncate small muted" style={{ marginTop: 2 }}>
            {row.preview}
          </div>
        )}
      </div>

      {showCategory && (
        <div style={{ minWidth: 0 }}>{row.category && <span className="tag">{row.category}</span>}</div>
      )}

      <div className="mono muted" style={{ textAlign: 'right' }}>
        {timeLabel(row.sentAt)}
      </div>
    </Link>
  );
});
