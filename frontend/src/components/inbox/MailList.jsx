/* The mail table. Column set changes per breakpoint tier: the category column
   goes first, then the sender column folds under the subject on phones. */
import { Checkbox, Empty, Spinner, priorityOf, timeLabel } from '../ui.jsx';

const GRID = {
  xxs: '20px 14px minmax(110px, 1fr) minmax(32px, 40px)',
  xs: '20px 14px minmax(64px, 1fr) minmax(120px, 2fr) minmax(32px, 40px)',
  sm: '20px minmax(56px, 72px) minmax(80px, 1fr) minmax(130px, 2.4fr) minmax(36px, 48px)',
  lg: '20px minmax(56px, 76px) minmax(80px, 1fr) minmax(120px, 2.6fr) minmax(0, 0.9fr) minmax(36px, 48px)',
};

export default function MailList({
  rows,
  loading,
  tier,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  compact = false,
  showPreviews = true,
  query,
}) {
  const showCategory = tier === 'lg';
  const showSenderColumn = tier !== 'xxs';
  const stackSender = tier === 'xxs';
  const showPriorityLabel = tier === 'sm' || tier === 'lg';
  const gridTemplateColumns = GRID[tier] || GRID.lg;

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));

  if (loading) return <Spinner label="Loading mail" />;

  if (!rows.length) {
    return (
      <Empty
        title={query ? 'No matches' : 'Nothing left here'}
        body={
          query
            ? 'Try a sender, an address, or a topic like “invoice” or “meeting”.'
            : 'This filter is clear. Pick another above.'
        }
      />
    );
  }

  return (
    <div role="table" aria-label="Messages">
      <div className="mail-head label" style={{ gridTemplateColumns }} role="row">
        <Checkbox
          checked={allSelected}
          onChange={() => onToggleAll(allSelected)}
          label={allSelected ? 'Clear selection' : 'Select all shown'}
        />
        {showPriorityLabel ? <div>Priority</div> : <div><span className="sr-only">Priority</span></div>}
        {showSenderColumn && <div>From</div>}
        <div>Subject</div>
        {showCategory && <div>Category</div>}
        <div style={{ textAlign: 'right' }}>Time</div>
      </div>

      {rows.map((row) => {
        const isSelected = selected.includes(row.id);
        const priority = priorityOf(row.priority);
        return (
          <div
            key={row.id}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            className={`mail-row ${compact ? 'mail-row-compact' : ''}`}
            style={{ gridTemplateColumns }}
            onClick={() => onOpen(row)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onOpen(row);
              if (event.key === ' ') {
                event.preventDefault();
                onToggle(row.id);
              }
            }}
          >
            <Checkbox
              checked={isSelected}
              onChange={() => onToggle(row.id)}
              label={`Select ${row.subject || row.from_name}`}
            />

            <div className="row gap-6">
              <span className="prio-dot" style={{ background: priority.color }} />
              {showPriorityLabel && (
                <span className="small" style={{ fontWeight: 600, color: priority.color }}>
                  {priority.label}
                </span>
              )}
            </div>

            {showSenderColumn && (
              <div className="row gap-6" style={{ minWidth: 0 }}>
                {row.is_vip && (
                  <span
                    className="tiny"
                    style={{ flex: 'none', color: 'var(--accent)' }}
                    title="Important person"
                  >
                    ★
                  </span>
                )}
                <span
                  className="truncate small"
                  style={{
                    fontWeight: 500,
                    color: row.is_vip ? 'var(--text-primary)' : 'var(--text-body)',
                  }}
                >
                  {row.from_name || row.from_email}
                </span>
              </div>
            )}

            <div style={{ minWidth: 0 }}>
              {stackSender && (
                <div className="row gap-4" style={{ marginBottom: 2 }}>
                  {row.is_vip && (
                    <span className="tiny" style={{ flex: 'none', color: 'var(--accent)' }}>
                      ★
                    </span>
                  )}
                  <span
                    className="truncate small"
                    style={{ fontWeight: 600, color: 'var(--text-secondary)' }}
                  >
                    {row.from_name || row.from_email}
                  </span>
                </div>
              )}
              <div
                className="truncate small"
                style={{ fontWeight: 500, color: 'var(--text-primary)' }}
              >
                {row.subject || '(no subject)'}
              </div>
              {row.show_address && (
                <div
                  className="truncate mono tiny"
                  style={{ color: 'var(--accent)', marginTop: 2 }}
                >
                  {row.from_email}
                </div>
              )}
              {showPreviews && row.preview && (
                <div className="truncate small muted" style={{ marginTop: 2 }}>
                  {row.preview}
                </div>
              )}
            </div>

            {showCategory && (
              <div style={{ minWidth: 0 }}>
                {row.category && <span className="tag">{row.category}</span>}
              </div>
            )}

            <div className="mono muted" style={{ textAlign: 'right' }}>
              {timeLabel(row.timestamp)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
