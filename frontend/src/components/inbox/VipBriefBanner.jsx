/* The important-person banner.

   The confidence rule from the handoff is enforced here: a date is only printed
   when the backend confirmed it with a real date parser. Otherwise the banner
   shows the sentence it read and says the deadline is unconfirmed. */
import { hhmm } from '../ui.jsx';

export default function VipBriefBanner({ brief, onOpen, onDismiss }) {
  if (!brief) return null;

  const confirmed = brief.due_is_confirmed;
  const dueText = confirmed
    ? brief.brief_due_text || hhmm(brief.brief_due_at)
    : brief.brief_due_text || 'Mentions a deadline — not confirmed';

  return (
    <div className="shell-pad" style={{ marginTop: 24 }}>
      <div className="card card-accent banner">
        <div className="banner-mark" aria-hidden="true">
          ★
        </div>

        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div className="row wrap gap-8">
            <span
              className="label"
              style={{ color: 'var(--accent)' }}
            >
              Important person
            </span>
            <span className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {brief.from_name}
            </span>
            <span className="mono tiny muted">{brief.from_email}</span>
          </div>

          <div className="h2 pretty" style={{ marginTop: 6, fontSize: 16 }}>
            {brief.subject}
          </div>

          <div className="brief-grid">
            <div>
              <div className="label">What they need</div>
              <div className="small mt-4">{brief.brief_ask || '—'}</div>
            </div>
            <div>
              <div className="label">Due</div>
              <div
                className="small mt-4"
                style={{
                  fontWeight: 600,
                  color: confirmed ? 'var(--danger)' : 'var(--text-secondary)',
                }}
              >
                {dueText}
              </div>
            </div>
            <div>
              <div className="label">Why flagged</div>
              <div className="small secondary mt-4">{brief.brief_why || '—'}</div>
            </div>
          </div>

          <div
            className="row wrap gap-12 mt-12"
            style={{
              paddingTop: 12,
              borderTop: '1px solid var(--border-medium)',
              alignItems: 'baseline',
            }}
          >
            <span
              className="badge"
              style={{ color: confirmed ? 'var(--success)' : 'var(--warning)' }}
            >
              {confirmed ? 'Read from the message' : 'Low confidence — check yourself'}
            </span>
            {brief.brief_evidence && (
              <span
                className="small secondary pretty"
                style={{ flex: '1 1 200px', minWidth: 0, fontStyle: 'italic' }}
              >
                “{brief.brief_evidence}”
              </span>
            )}
          </div>
        </div>

        <div className="row gap-8" style={{ flex: 'none' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpen}>
            Open thread
          </button>
          <button type="button" className="btn btn-sm" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
