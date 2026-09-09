/* Schedule: the day as meetings and reply blocks, with bulk reassign.

   Selecting threads reveals the move targets; clicking a time chip pins the
   selection to that block. "Rebuild plan" drops every manual pin and repacks. */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../api/client.js';
import { Checkbox, Chip, ErrorNote, Spinner } from '../components/ui.jsx';
import { useApp } from '../state/AppContext.jsx';

const BLOCK_OPTIONS = [15, 30, 45];

export default function ScheduleView() {
  const { say } = useApp();
  const [blockMinutes, setBlockMinutes] = useState(30);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.schedule({ block_minutes: blockMinutes }));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }, [blockMinutes]);

  useEffect(() => {
    load();
  }, [load]);

  const slots = useMemo(
    () => (data?.rows || []).filter((row) => row.type === 'slot'),
    [data],
  );

  const toggle = (id) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const moveTo = async (slotKey) => {
    if (!selected.length) return;
    try {
      const result = await api.assignSlot(selected, slotKey);
      say(`Moved ${result.assigned} to ${slots.find((s) => s.key === slotKey)?.start ?? slotKey}`);
      setSelected([]);
      await load();
    } catch (caught) {
      say(caught.message);
    }
  };

  const rebuild = async () => {
    try {
      const result = await api.rebuildSchedule(blockMinutes);
      setData(result);
      setSelected([]);
      say('Plan rebuilt from priorities and deadlines');
    } catch (caught) {
      say(caught.message);
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="h1">Schedule</h1>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            Replies packed into the gaps between today’s meetings
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const first = slots.find((slot) => slot.items.length);
            say(first ? `Opened the ${first.start} block` : 'No reply work scheduled today');
          }}
        >
          Start first block
        </button>
      </header>

      <section className="section">
        <div className="col-main stack gap-12">
          {error && <ErrorNote error={error} onRetry={load} />}
          {loading && <Spinner label="Building today’s plan" />}

          {!loading && !error && selected.length > 0 && (
            <div
              className="card row wrap gap-12"
              style={{ padding: '12px 16px', background: 'var(--bg-tertiary)' }}
            >
              <span className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {selected.length} selected
              </span>
              <span className="small muted">Move to</span>
              {slots.map((slot) => (
                <button
                  key={slot.key}
                  type="button"
                  className="btn btn-sm mono"
                  onClick={() => moveTo(slot.key)}
                >
                  {slot.start}
                </button>
              ))}
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

          {!loading &&
            !error &&
            (data?.rows || []).map((row, index) =>
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
                <SlotCard
                  key={row.key}
                  slot={row}
                  selected={selected}
                  onToggle={toggle}
                  say={say}
                />
              ),
            )}

          {!loading && !error && data?.overflow_count > 0 && (
            <div className="card card-warning" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="card-head">
                <div className="h2">Doesn’t fit today · {data.overflow_count}</div>
                <div className="small secondary mt-4">
                  Nothing here has a deadline today. Move one into a block above if it matters more
                  than what’s already there.
                </div>
              </div>
              {data.overflow.map((item) => (
                <ReplyRow
                  key={item.id}
                  item={item}
                  selected={selected.includes(item.id)}
                  onToggle={() => toggle(item.id)}
                  say={say}
                  showDraft={false}
                />
              ))}
            </div>
          )}

          {!loading && !error && !slots.length && (
            <div className="card card-pad small muted">
              No free blocks between 09:00 and 18:00 today. Sync a calendar, or take the day off.
            </div>
          )}
        </div>

        <aside className="rail">
          <div className="card card-pad">
            <div className="h3">Today’s reply load</div>
            <div className="row gap-8 mt-12" style={{ alignItems: 'baseline' }}>
              <span className="metric-number">{data?.total_reply_minutes ?? 0} min</span>
              <span className="mono muted">{data?.capacity_minutes ?? 0} min free</span>
            </div>
            <div
              className="small mt-8"
              style={{ color: data?.fits ? 'var(--success)' : 'var(--warning)' }}
            >
              {data?.fits
                ? 'Today’s replies fit inside the gaps between your meetings.'
                : `Your replies need ${data?.shortfall_minutes ?? 0} min more than today has free.`}
            </div>
            <div className="small muted mt-12">
              Blocks come from the gaps in your calendar. Estimates come from thread length and how
              long past replies to each sender took.
            </div>
          </div>

          <div className="card card-pad">
            <div className="label">Email time per block</div>
            <div className="row wrap gap-6 mt-10">
              {BLOCK_OPTIONS.map((value) => (
                <Chip
                  key={value}
                  active={blockMinutes === value}
                  onClick={() => {
                    setBlockMinutes(value);
                    setSelected([]);
                  }}
                >
                  {value} min
                </Chip>
              ))}
            </div>
            <div className="small muted mt-10">
              However long a gap is, no more than this goes to email. The rest of the gap stays
              yours.
            </div>
            <button type="button" className="btn btn-block mt-16" onClick={rebuild}>
              Rebuild plan
            </button>
            <div className="small muted mt-8">
              Clears your manual moves and repacks deadline-first.
            </div>
          </div>
        </aside>
      </section>
    </>
  );
}

function SlotCard({ slot, selected, onToggle, say }) {
  const over = slot.over_capacity;
  const capacityColor = over
    ? 'var(--danger)'
    : slot.used_minutes === 0
      ? 'var(--text-tertiary)'
      : 'var(--success)';
  const fill = slot.capacity_minutes
    ? Math.min(100, Math.round((slot.used_minutes / slot.capacity_minutes) * 100))
    : 0;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)' }}>
        <div
          className="row wrap gap-12"
          style={{ justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <span className="h2">
            {slot.start}–{slot.end}
          </span>
          <span className="mono" style={{ color: capacityColor }}>
            {slot.used_minutes} of {slot.capacity_minutes} min
          </span>
        </div>
        <div className="capacity-track">
          <div
            className="capacity-fill"
            style={{ width: `${fill}%`, background: over ? 'var(--danger)' : 'var(--accent)' }}
          />
        </div>
      </div>

      {slot.items.map((item) => (
        <ReplyRow
          key={item.id}
          item={item}
          selected={selected.includes(item.id)}
          onToggle={() => onToggle(item.id)}
          say={say}
        />
      ))}

      {!slot.items.length && (
        <div className="small secondary" style={{ padding: '20px 16px', textAlign: 'center' }}>
          Free — nothing needs this block
        </div>
      )}
    </div>
  );
}

function ReplyRow({ item, selected, onToggle, say, showDraft = true }) {
  return (
    <div className="slot-item" aria-selected={selected}>
      <div style={{ marginTop: 2 }}>
        <Checkbox checked={selected} onChange={onToggle} label={`Select ${item.subject}`} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row wrap gap-6">
          {item.is_vip && (
            <span className="tiny" style={{ flex: 'none', color: 'var(--accent)' }}>
              ★
            </span>
          )}
          <span className="small" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            {item.from_name || item.from_email}
          </span>
          <span className="mono tiny muted">{item.effort_minutes} min</span>
          {item.has_due && (
            <span
              className="badge"
              style={{ color: item.violates_deadline ? 'var(--danger)' : 'var(--warning)' }}
            >
              due {item.due_label}
            </span>
          )}
        </div>

        <div className="small pretty" style={{ color: 'var(--text-primary)', marginTop: 3 }}>
          {item.subject || '(no subject)'}
        </div>

        {item.violates_deadline && (
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
          onClick={() => say(`Draft opened for ${item.from_name || item.from_email}`)}
        >
          Draft reply
        </button>
      )}
    </div>
  );
}
