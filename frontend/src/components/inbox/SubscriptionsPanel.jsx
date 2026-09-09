/* Suggested cleanup: dormant senders, with unsubscribe / blacklist / restore.

   Dormancy depends on the chosen window, so changing the window re-asks the
   server rather than filtering client-side. */
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../api/client.js';
import { Checkbox, Chip, Spinner } from '../ui.jsx';

const WINDOWS = [30, 90, 180];

const STATUS_COLOR = {
  Blacklisted: 'var(--danger)',
  Unsubscribed: 'var(--text-tertiary)',
  'No activity': 'var(--warning)',
  Active: 'var(--success)',
};

export default function SubscriptionsPanel({ say, onChanged }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('subs');
  const [windowDays, setWindowDays] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.subscriptions({ window: windowDays }));
    } catch (error) {
      say(error.message);
    } finally {
      setLoading(false);
    }
  }, [windowDays, say]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = (data?.results || []).filter((row) =>
    tab === 'subs' ? row.status !== 'muted' : row.status === 'muted',
  );
  const dormantIds = (data?.results || [])
    .filter((row) => row.is_dormant)
    .map((row) => row.id);

  const act = async (action, ids) => {
    if (!ids.length) return;
    setBusy(true);
    try {
      if (ids.length === 1) {
        if (action === 'unsubscribe') await api.unsubscribe(ids[0]);
        else if (action === 'blacklist') await api.blacklist(ids[0]);
        else await api.resubscribe(ids[0]);
      } else {
        await api.subscriptionBulk(action, ids);
      }
      const verb = { unsubscribe: 'Unsubscribed from', blacklist: 'Blacklisted', resubscribe: 'Restored' }[action];
      say(`${verb} ${ids.length} sender${ids.length === 1 ? '' : 's'}`);
      setSelected([]);
      await load();
      onChanged?.();
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  };

  const dormantCount = data?.dormant_count ?? 0;

  return (
    <div className="card card-pad">
      <div className="h3">Suggested cleanup</div>
      <div className="small muted mt-4">
        {dormantCount
          ? `${dormantCount} lists you never opened in ${windowDays} days — ${data?.dormant_volume ?? 0} emails a month between them.`
          : `No dormant lists in the last ${windowDays} days. Nothing to clean up.`}
      </div>

      <div
        className="mt-16"
        style={{ paddingTop: 16, borderTop: '1px solid var(--border-light)' }}
      >
        <div className="row gap-8" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="small" style={{ fontWeight: 600 }}>
            Dead subscriptions
          </span>
          <span
            className="mono"
            style={{ color: dormantCount ? 'var(--warning)' : 'var(--text-tertiary)' }}
          >
            {dormantCount}
          </span>
        </div>

        <button
          type="button"
          className="btn btn-block mt-12"
          onClick={() => {
            setOpen((value) => !value);
            setSelected([]);
          }}
          aria-expanded={open}
        >
          {open ? 'Hide subscriptions' : 'Manage subscriptions'}
        </button>

        {open && (
          <div
            className="mt-12"
            style={{
              border: '1px solid var(--border-light)',
              borderRadius: 10,
              overflow: 'hidden',
              background: '#131317',
            }}
          >
            <div
              className="row gap-4"
              style={{ padding: 10, borderBottom: '1px solid var(--border-light)' }}
            >
              {[
                { key: 'subs', label: 'Subscriptions' },
                { key: 'muted', label: 'Blacklist' },
              ].map((item) => {
                const count = (data?.results || []).filter((row) =>
                  item.key === 'subs' ? row.status !== 'muted' : row.status === 'muted',
                ).length;
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={tab === item.key}
                    className="chip chip-sm"
                    style={{ flex: 1, borderRadius: 'var(--radius-sm)' }}
                    onClick={() => {
                      setTab(item.key);
                      setSelected([]);
                    }}
                  >
                    {item.label}
                    <span className="chip-count">{count}</span>
                  </button>
                );
              })}
            </div>

            {tab === 'subs' && (
              <div style={{ padding: 10, borderBottom: '1px solid var(--border-light)' }}>
                <div className="row wrap gap-4">
                  <span className="label" style={{ marginRight: 2 }}>
                    No activity in
                  </span>
                  {WINDOWS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={windowDays === value}
                      className="chip chip-sm mono"
                      style={{ padding: '4px 7px', fontSize: 10 }}
                      onClick={() => {
                        setWindowDays(value);
                        setSelected([]);
                      }}
                    >
                      {value} days
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-block btn-sm mt-10"
                  disabled={!dormantIds.length}
                  onClick={() => setSelected(dormantIds)}
                >
                  Select all {dormantCount} dormant
                </button>
              </div>
            )}

            {selected.length > 0 && (
              <div
                style={{
                  padding: 10,
                  background: 'var(--bg-tertiary)',
                  borderBottom: '1px solid var(--border-medium)',
                }}
              >
                <div className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selected.length} selected
                </div>
                <div className="row wrap gap-6 mt-8">
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ flex: 1 }}
                    disabled={busy}
                    onClick={() => act('unsubscribe', selected)}
                  >
                    Unsubscribe
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    style={{ flex: 1 }}
                    disabled={busy}
                    onClick={() => act('blacklist', selected)}
                  >
                    Blacklist
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelected([])}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            <div className="scroll-y" style={{ maxHeight: 300 }}>
              {loading && <Spinner label="Reading activity" />}

              {!loading && !rows.length && (
                <div className="small muted" style={{ padding: '24px 12px', textAlign: 'center' }}>
                  {tab === 'muted'
                    ? 'Nothing blacklisted. Mute a sender to stop it reaching the inbox.'
                    : 'No mailing lists found. Sync your mailbox to populate this.'}
                </div>
              )}

              {!loading &&
                rows.map((row) => {
                  const isSelected = selected.includes(row.id);
                  return (
                    <div
                      key={row.id}
                      className="striped"
                      style={{
                        padding: 10,
                        borderBottom: '1px solid var(--border-row)',
                        background: isSelected ? 'var(--bg-tertiary)' : undefined,
                      }}
                    >
                      <div className="row gap-8" style={{ alignItems: 'flex-start' }}>
                        <div style={{ marginTop: 2 }}>
                          <Checkbox
                            checked={isSelected}
                            label={`Select ${row.sender_name}`}
                            onChange={() =>
                              setSelected((current) =>
                                current.includes(row.id)
                                  ? current.filter((id) => id !== row.id)
                                  : [...current, row.id],
                              )
                            }
                          />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row wrap gap-6">
                            <span
                              className="small"
                              style={{ fontWeight: 600, color: 'var(--text-primary)' }}
                            >
                              {row.sender_name || row.sender_email}
                            </span>
                            <span
                              className="badge"
                              style={{
                                color: STATUS_COLOR[row.status_label] || 'var(--text-secondary)',
                              }}
                            >
                              {row.status_label}
                            </span>
                          </div>

                          <div className="tiny muted" style={{ marginTop: 3 }}>
                            {row.activity_label} · {row.messages_per_month}/mo
                          </div>

                          {row.status === 'muted' && (
                            <div className="tiny" style={{ color: 'var(--warning)', marginTop: 3 }}>
                              Held 30 days before deletion — un-blacklist to get it back
                            </div>
                          )}

                          <div className="row wrap gap-6 mt-8">
                            {row.status === 'active' && (
                              <button
                                type="button"
                                className="btn btn-xs"
                                disabled={busy}
                                onClick={() => act('unsubscribe', [row.id])}
                                title={
                                  row.can_unsubscribe
                                    ? 'Uses the sender’s List-Unsubscribe header'
                                    : 'No List-Unsubscribe header — marks it locally'
                                }
                              >
                                Unsubscribe
                              </button>
                            )}
                            {row.status !== 'active' && (
                              <button
                                type="button"
                                className="btn btn-xs"
                                disabled={busy}
                                onClick={() => act('resubscribe', [row.id])}
                              >
                                {row.status === 'muted' ? 'Un-blacklist' : 'Resubscribe'}
                              </button>
                            )}
                            {row.status !== 'muted' && (
                              <button
                                type="button"
                                className="btn btn-danger btn-xs"
                                disabled={busy}
                                onClick={() => act('blacklist', [row.id])}
                                title="Never deliver mail from this sender"
                              >
                                Blacklist
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div
              className="tiny muted"
              style={{ padding: 10, borderTop: '1px solid var(--border-light)', lineHeight: 1.5 }}
            >
              Unsubscribe stops the sender at the source. Blacklist mutes anything that keeps
              arriving.
              <br />
              Activity is read from your stored mail — a new account needs about two weeks before
              this is meaningful.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
