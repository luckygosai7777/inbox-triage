/* Inbox: metrics, search, filters, the mail list, and the right rail. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api/client.js';
import MailList from '../components/inbox/MailList.jsx';
import SubscriptionsPanel from '../components/inbox/SubscriptionsPanel.jsx';
import VipBriefBanner from '../components/inbox/VipBriefBanner.jsx';
import VipPanel from '../components/inbox/VipPanel.jsx';
import { Chip, ErrorNote, Metric, useTier } from '../components/ui.jsx';
import { useApp } from '../state/AppContext.jsx';

/** Debounces a value. The handoff asks for 300ms on search. */
function useDebounced(value, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export default function InboxView() {
  const { say, setView, account } = useApp();
  const tier = useTier();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState([]);
  const [mail, setMail] = useState({ results: [], filters: [], count: 0 });
  const [metrics, setMetrics] = useState(null);
  const [brief, setBrief] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const searchRef = useRef(null);
  const debouncedQuery = useDebounced(query);

  const loadMail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMail(await api.mail({ filter, search: debouncedQuery }));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedQuery]);

  const loadSidebars = useCallback(async () => {
    const [metricsResult, briefResult, scheduleResult] = await Promise.allSettled([
      api.metrics({ window: 90 }),
      api.vipBrief(),
      api.schedule({ block_minutes: 30 }),
    ]);
    if (metricsResult.status === 'fulfilled') setMetrics(metricsResult.value);
    if (briefResult.status === 'fulfilled') setBrief(briefResult.value.brief);
    if (scheduleResult.status === 'fulfilled') setSchedule(scheduleResult.value);
  }, []);

  useEffect(() => {
    loadMail();
  }, [loadMail, refreshKey]);

  useEffect(() => {
    loadSidebars();
  }, [loadSidebars, refreshKey]);

  // "/" focuses search, Escape clears it — matching the prototype.
  useEffect(() => {
    const onKey = (event) => {
      const typing = /input|textarea/i.test(event.target.tagName || '');
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && typing) {
        setQuery('');
        event.target.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const refreshAll = () => setRefreshKey((key) => key + 1);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.sync();
      say(
        `Synced ${result.fetched} messages · ${result.created} new · ${result.classified} classified`,
      );
      refreshAll();
    } catch (caught) {
      say(
        caught.status === 409
          ? 'Connect a Google account first (see the banner above)'
          : caught.message,
      );
    } finally {
      setSyncing(false);
    }
  };

  const toggle = (id) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const toggleAll = (allSelected) =>
    setSelected(allSelected ? [] : mail.results.map((row) => row.id));

  const bulkDelete = async () => {
    if (!selected.length) return;
    try {
      const result = await api.bulkDelete(selected);
      say(`Moved ${result.deleted} to trash${result.remote ? '' : ' (locally)'}`);
      setSelected([]);
      refreshAll();
    } catch (caught) {
      say(caught.message);
    }
  };

  const openThread = async (row) => {
    try {
      const thread = await api.mailDetail(row.id);
      const count = thread.messages?.length ?? 1;
      say(`${row.subject || row.from_name} · ${count} message${count === 1 ? '' : 's'} in thread`);
    } catch (caught) {
      say(caught.message);
    }
  };

  const dismissBrief = async () => {
    if (!brief) return;
    try {
      await api.dismissBrief(brief.id);
      setBrief(null);
    } catch (caught) {
      say(caught.message);
    }
  };

  const railSlots = useMemo(
    () => (schedule?.rows || []).filter((row) => row.type === 'slot').slice(0, 3),
    [schedule],
  );

  const needsReply = metrics?.needs_reply ?? 0;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="h1">Inbox</h1>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            Sorted by reply priority
            {account?.last_synced_at
              ? ` · synced ${new Date(account.last_synced_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : ''}
          </p>
        </div>
        <div className="row gap-8 wrap">
          <button type="button" className="btn" onClick={sync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync Gmail'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setFilter('Needs reply');
              setSelected([]);
            }}
          >
            Start triage
            <span className="mono" style={{ fontSize: 11, opacity: 0.6 }}>
              {needsReply}
            </span>
          </button>
        </div>
      </header>

      {account && !account.google_connected && <ConnectBanner say={say} />}

      <VipBriefBanner
        brief={brief}
        onOpen={() => {
          if (brief) setQuery(brief.from_email);
        }}
        onDismiss={dismissBrief}
      />

      <section className="metrics">
        <Metric
          label="Needs reply"
          value={needsReply}
          hint={schedule ? `${schedule.total_reply_minutes} min` : undefined}
          hintColor="var(--accent)"
        />
        <Metric label="Clearable" value={metrics?.clearable ?? 0} hint="bulk-safe" />
        <Metric
          label="Dormant lists"
          value={metrics?.dormant_count ?? 0}
          hint={metrics ? `${metrics.dormant_volume}/mo` : undefined}
        />
      </section>

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
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected([]);
                }}
                aria-label="Search mail"
              />
              {query && (
                <button
                  type="button"
                  className="btn-icon"
                  style={{ color: 'var(--text-tertiary)' }}
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div
            className="row wrap gap-8"
            style={{ padding: '12px 16px 16px', borderBottom: '1px solid var(--border-light)' }}
          >
            {(mail.filters || []).map((item) => (
              <Chip
                key={item.label}
                active={filter === item.label}
                count={item.count}
                onClick={() => {
                  setFilter(item.label);
                  setSelected([]);
                }}
              >
                {item.label}
              </Chip>
            ))}
            <div className="spacer" />
            <div className="mono muted">{mail.count} shown</div>
          </div>

          {selected.length > 0 && (
            <div
              className="row wrap gap-16"
              style={{
                padding: '12px 16px',
                background: 'var(--bg-tertiary)',
                borderBottom: '1px solid var(--border-medium)',
              }}
            >
              <span className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {selected.length} selected
              </span>
              <button type="button" className="btn btn-danger btn-sm" onClick={bulkDelete}>
                Delete
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setView('schedule');
                  setSelected([]);
                }}
              >
                Schedule replies
              </button>
              <div className="spacer" />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelected([])}
              >
                Clear
              </button>
            </div>
          )}

          {error ? (
            <div style={{ padding: 16 }}>
              <ErrorNote error={error} onRetry={loadMail} />
            </div>
          ) : (
            <MailList
              rows={mail.results}
              loading={loading}
              tier={tier}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onOpen={openThread}
              query={debouncedQuery}
            />
          )}
        </div>

        <aside className="rail">
          <div className="card card-pad">
            <div
              className="row gap-8"
              style={{ justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <span className="h3">Reply schedule</span>
              <span className="mono" style={{ color: 'var(--accent)' }}>
                {schedule ? `${schedule.total_reply_minutes} min` : '—'}
              </span>
            </div>
            <div
              className="small mt-4"
              style={{ color: schedule?.fits ? 'var(--success)' : 'var(--warning)' }}
            >
              {schedule
                ? schedule.fits
                  ? 'Today’s replies fit inside the gaps between your meetings.'
                  : `Your replies need ${schedule.shortfall_minutes} min more than today has free.`
                : 'Reading your calendar…'}
            </div>

            <div className="stack gap-8 mt-16">
              {railSlots.map((slot) => {
                const over = slot.over_capacity;
                const accent = over
                  ? 'var(--danger)'
                  : slot.used_minutes === 0
                    ? 'var(--text-faint)'
                    : 'var(--accent)';
                const names = slot.items.map((item) => item.from_name);
                return (
                  <div
                    key={slot.key}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius)',
                      borderLeft: `2px solid ${accent}`,
                      padding: 12,
                    }}
                  >
                    <div
                      className="row gap-8"
                      style={{ justifyContent: 'space-between', alignItems: 'baseline' }}
                    >
                      <span className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {slot.start}–{slot.end}
                      </span>
                      <span className="mono" style={{ color: accent }}>
                        {slot.used_minutes}/{slot.capacity_minutes} min
                      </span>
                    </div>
                    <div className="small secondary mt-4">
                      {names.length === 0
                        ? 'Free'
                        : names.length === 1
                          ? names[0]
                          : `${names[0]} + ${names.length - 1} more`}
                    </div>
                  </div>
                );
              })}
              {!railSlots.length && (
                <div className="small muted">No free blocks on today’s calendar.</div>
              )}
            </div>

            {schedule?.overflow_count > 0 && (
              <div className="small mt-10" style={{ color: 'var(--warning)' }}>
                {schedule.overflow_count} won’t fit in today’s gaps
              </div>
            )}

            <button
              type="button"
              className="btn btn-block mt-16"
              onClick={() => setView('schedule')}
            >
              Open full schedule
            </button>
          </div>

          <SubscriptionsPanel say={say} onChanged={refreshAll} />
          <VipPanel say={say} onChanged={refreshAll} refreshKey={refreshKey} />

          <div className="card card-pad">
            <div className="h3">Send a document in bulk</div>
            <div className="small muted mt-4">
              Attach one file, pick a recipient list, approve once — each message opens in Gmail
              for you to send.
            </div>
            <button
              type="button"
              className="btn btn-block mt-12"
              onClick={() => setView('bulk')}
            >
              New bulk send
            </button>
          </div>
        </aside>
      </section>
    </>
  );
}

function ConnectBanner({ say }) {
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      const { authorization_url: url } = await api.googleStart();
      window.location.href = url;
    } catch (error) {
      say(error.message);
      setBusy(false);
    }
  };

  return (
    <div className="shell-pad" style={{ marginTop: 24 }}>
      <div className="card card-warning card-pad">
        <div className="row wrap gap-16" style={{ justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              No Google account connected
            </div>
            <div className="small muted mt-4">
              Connect Gmail to sync real mail and read your calendar. Until then you are looking at
              whatever is already stored locally.
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={connect} disabled={busy}>
            {busy ? 'Redirecting…' : 'Connect Google'}
          </button>
        </div>
      </div>
    </div>
  );
}
