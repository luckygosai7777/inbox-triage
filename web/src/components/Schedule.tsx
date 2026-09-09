'use client';

import { useCallback, useEffect, useState } from 'react';

import { useToast } from './Shell';

type Item = {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  effortMinutes: number;
  isVip: boolean;
  hasDue: boolean;
  dueLabel: string;
  violatesDeadline: boolean;
};

type Row =
  | {
      type: 'slot';
      key: string;
      start: string;
      end: string;
      startHour: number;
      capacityMinutes: number;
      usedMinutes: number;
      overCapacity: boolean;
      items: Item[];
    }
  | { type: 'meeting'; title: string; start: string; end: string; startHour: number };

type Data = {
  rows: Row[];
  overflow: Item[];
  overflowCount: number;
  totalReplyMinutes: number;
  capacityMinutes: number;
  fits: boolean;
  shortfallMinutes: number;
};

export default function Schedule() {
  const { say } = useToast();
  const [blockMinutes, setBlockMinutes] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/schedule?block_minutes=${blockMinutes}`, {
        credentials: 'include',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not build the plan');
      setData(body);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [blockMinutes]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="h1">Schedule</h1>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            Replies packed into the gaps between today’s meetings
          </p>
        </div>
      </header>

      <section className="section">
        <div className="col-main stack gap-12">
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

          {loading && <div className="empty muted small">Building today’s plan…</div>}

          {!loading &&
            !error &&
            data?.rows.map((row, index) =>
              row.type === 'meeting' ? (
                <div key={`m${index}`} className="meeting-row">
                  <span className="mono" style={{ flex: 'none' }}>
                    {row.start}–{row.end}
                  </span>
                  <span className="small">{row.title}</span>
                  <span className="label" style={{ color: 'var(--text-secondary)' }}>
                    busy
                  </span>
                </div>
              ) : (
                <SlotCard key={row.key} slot={row} say={say} />
              ),
            )}

          {!loading && !error && (data?.overflowCount ?? 0) > 0 && (
            <div className="card card-warning" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="card-head">
                <div className="h2">Doesn’t fit today · {data!.overflowCount}</div>
                <div className="small secondary mt-4">
                  Nothing here has a deadline today. Something above has to give if these matter
                  more.
                </div>
              </div>
              {data!.overflow.map((item) => (
                <ReplyRow key={item.id} item={item} say={say} showDraft={false} />
              ))}
            </div>
          )}

          {!loading && !error && !data?.rows.length && (
            <div className="card card-pad small muted">
              No free blocks between 09:00 and 18:00 today. Sync your calendar, or take the day off.
            </div>
          )}
        </div>

        <aside className="rail">
          <div className="card card-pad">
            <div className="h3">Today’s reply load</div>
            <div className="row gap-8 mt-12" style={{ alignItems: 'baseline' }}>
              <span className="metric-number">{data?.totalReplyMinutes ?? 0} min</span>
              <span className="mono muted">{data?.capacityMinutes ?? 0} min free</span>
            </div>
            <div
              className="small mt-8"
              style={{ color: data?.fits ? 'var(--success)' : 'var(--warning)' }}
            >
              {data?.fits
                ? 'Today’s replies fit inside the gaps between your meetings.'
                : `Your replies need ${data?.shortfallMinutes ?? 0} min more than today has free.`}
            </div>
          </div>

          <div className="card card-pad">
            <div className="label">Email time per block</div>
            <div className="row wrap gap-6 mt-10">
              {[15, 30, 45].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  aria-pressed={blockMinutes === value}
                  onClick={() => setBlockMinutes(value)}
                >
                  {value} min
                </button>
              ))}
            </div>
            <div className="small muted mt-10">
              However long a gap is, no more than this goes to email. The rest stays yours.
            </div>
          </div>
        </aside>
      </section>
    </>
  );
}

function SlotCard({ slot, say }: { slot: Extract<Row, { type: 'slot' }>; say: (m: string) => void }) {
  const capacityColor = slot.overCapacity
    ? 'var(--danger)'
    : slot.usedMinutes === 0
      ? 'var(--text-tertiary)'
      : 'var(--success)';
  const fill = slot.capacityMinutes
    ? Math.min(100, Math.round((slot.usedMinutes / slot.capacityMinutes) * 100))
    : 0;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)' }}>
        <div className="row wrap gap-12" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="h2">
            {slot.start}–{slot.end}
          </span>
          <span className="mono" style={{ color: capacityColor }}>
            {slot.usedMinutes} of {slot.capacityMinutes} min
          </span>
        </div>
        <div className="capacity-track">
          <div
            className="capacity-fill"
            style={{ width: `${fill}%`, background: slot.overCapacity ? 'var(--danger)' : 'var(--accent)' }}
          />
        </div>
      </div>

      {slot.items.map((item) => (
        <ReplyRow key={item.id} item={item} say={say} />
      ))}

      {!slot.items.length && (
        <div className="small secondary" style={{ padding: '20px 16px', textAlign: 'center' }}>
          Free — nothing needs this block
        </div>
      )}
    </div>
  );
}

function ReplyRow({
  item,
  say,
  showDraft = true,
}: {
  item: Item;
  say: (m: string) => void;
  showDraft?: boolean;
}) {
  return (
    <div className="slot-item">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row wrap gap-6">
          {item.isVip && (
            <span className="tiny" style={{ flex: 'none', color: 'var(--accent)' }}>
              ★
            </span>
          )}
          <span className="small" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            {item.fromName || item.fromEmail}
          </span>
          <span className="mono tiny muted">{item.effortMinutes} min</span>
          {item.hasDue && (
            <span
              className="badge"
              style={{ color: item.violatesDeadline ? 'var(--danger)' : 'var(--warning)' }}
            >
              due {item.dueLabel}
            </span>
          )}
        </div>
        <div className="small pretty" style={{ color: 'var(--text-primary)', marginTop: 3 }}>
          {item.subject || '(no subject)'}
        </div>
        {item.violatesDeadline && (
          <div className="tiny" style={{ fontWeight: 600, color: 'var(--danger)', marginTop: 4 }}>
            Scheduled after its deadline — move it earlier
          </div>
        )}
      </div>

      {showDraft && (
        <button
          type="button"
          className="btn btn-sm"
          style={{ flex: 'none' }}
          onClick={() => say(`Draft opened for ${item.fromName || item.fromEmail}`)}
        >
          Draft reply
        </button>
      )}
    </div>
  );
}
