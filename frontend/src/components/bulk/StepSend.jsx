/* Step 4 — sending rules and the review loop.

   Nothing here sends. "Open in Gmail to send" opens a compose tab and records
   that it happened; the send click belongs to the user, inside Gmail. */
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../api/client.js';
import { Checkbox, ComposedText, Spinner, Toggle } from '../ui.jsx';

function resetLabel(iso) {
  if (!iso) return '';
  const remaining = new Date(iso).getTime() - Date.now();
  if (remaining <= 0) return '';
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.round((remaining % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

export default function StepSend({ campaign, patch, reload, say, onBack }) {
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const inReview = campaign.state === 'review';
  const isDone = campaign.state === 'done';

  const loadNext = useCallback(async () => {
    if (!inReview) {
      setNext(null);
      return;
    }
    setLoading(true);
    try {
      const result = await api.next(campaign.id);
      setNext(result.next);
    } catch (error) {
      say(error.message);
    } finally {
      setLoading(false);
    }
  }, [campaign.id, inReview, say]);

  useEffect(() => {
    loadNext();
  }, [loadNext, campaign.cursor]);

  const beginReview = async () => {
    setBusy(true);
    try {
      await api.beginReview(campaign.id);
      await reload();
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  };

  const openAndRecord = async () => {
    if (!next?.can_send || busy) return;
    setBusy(true);

    // Open the tab from inside the click handler so the popup blocker allows
    // it; recording the send afterwards must not cost us the window.
    const tab = window.open(next.gmail_url, '_blank', 'noopener,noreferrer');
    if (!tab) say('Allow pop-ups for this site to open Gmail');

    try {
      await api.sendRecord(campaign.id, { recipient_id: next.recipient.id });
      await reload();
    } catch (error) {
      say(
        error.status === 429
          ? `Batch limit reached — resets in ${resetLabel(error.body?.resets_at) || 'a few hours'}`
          : error.message,
      );
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (!next || busy) return;
    setBusy(true);
    try {
      await api.sendRecord(campaign.id, { recipient_id: next.recipient.id, skipped: true });
      await reload();
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await api.resetCampaign(campaign.id);
      say('Campaign reset — everything is back in the queue');
      await reload();
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  };

  const percent = campaign.total_count
    ? Math.round((campaign.cursor / campaign.total_count) * 100)
    : 0;

  return (
    <div className="row wrap gap-16" style={{ alignItems: 'flex-start' }}>
      <div className="card card-pad" style={{ flex: '1 1 400px', minWidth: 0 }}>
        <div className="h2">Sending rules</div>
        <div className="small secondary mt-8" style={{ lineHeight: 1.55 }}>
          Nothing sends itself. Each message opens in Gmail for you to look at, then you press send
          there — the click is always yours.
        </div>

        <div
          className="mt-20"
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius)',
            padding: 12,
          }}
        >
          <div
            className="row gap-8"
            style={{ justifyContent: 'space-between', alignItems: 'baseline' }}
          >
            <span className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Batch limit
            </span>
            <span className="mono" style={{ fontSize: 13, color: 'var(--accent)' }}>
              {campaign.window_used} / {campaign.batch_cap}
            </span>
          </div>
          <div className="small secondary mt-4" style={{ lineHeight: 1.5 }}>
            Caps each send window at {campaign.batch_cap} to keep this looking like what it is — a
            person sending mail, not a script.
          </div>
          {campaign.on_cooldown && (
            <div className="small mt-8" style={{ color: 'var(--warning)', fontWeight: 600 }}>
              Limit reached — resets in {resetLabel(campaign.window_resets_at) || 'a few hours'}
            </div>
          )}
        </div>

        <div className="row gap-12 mt-16" style={{ alignItems: 'flex-start' }}>
          <Toggle
            checked={campaign.working_hours_only}
            onChange={(value) => patch({ working_hours_only: value })}
            label="Working hours only"
          />
          <div style={{ flex: 1 }}>
            <div className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Working hours only
            </div>
            <div className="small muted" style={{ marginTop: 2 }}>
              Reminds you to hold off outside 09:00–18:00 rather than sending at 3am.
            </div>
          </div>
        </div>

        <div className="row gap-12 mt-20" style={{ alignItems: 'flex-start' }}>
          <div style={{ marginTop: 1 }}>
            <Checkbox
              large
              checked={campaign.approved}
              onChange={(value) => patch({ approved: value })}
              label="I understand I will send each message myself"
            />
          </div>
          <span className="small" style={{ lineHeight: 1.5 }}>
            I understand I’ll preview and send each message myself, one at a time.
          </span>
        </div>

        <div className="row gap-8 mt-16">
          <button type="button" className="btn" style={{ flex: 'none' }} onClick={onBack}>
            Back
          </button>
          {campaign.state === 'idle' && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={!campaign.approved || busy || !campaign.total_count}
              onClick={beginReview}
            >
              Start reviewing
            </button>
          )}
          {inReview && (
            <div className="row small muted" style={{ flex: 1 }}>
              Review each message on the right →
            </div>
          )}
          {isDone && (
            <button type="button" className="btn" style={{ flex: 1 }} onClick={reset}>
              Start a new campaign
            </button>
          )}
        </div>
      </div>

      <aside className="stack gap-16" style={{ flex: '1 1 360px', minWidth: 0 }}>
        <div className="card card-pad">
          <div
            className="row gap-12"
            style={{ justifyContent: 'space-between', alignItems: 'baseline' }}
          >
            <span className="h3">Progress</span>
            <span
              className="small"
              style={{
                fontWeight: 600,
                color: isDone
                  ? 'var(--success)'
                  : inReview
                    ? 'var(--accent)'
                    : 'var(--text-tertiary)',
              }}
            >
              {isDone ? 'Finished' : inReview ? 'Reviewing' : 'Draft'}
            </span>
          </div>
          <div className="row gap-8 mt-12" style={{ alignItems: 'baseline' }}>
            <span className="metric-number">{campaign.cursor}</span>
            <span className="mono muted">
              of {campaign.total_count} reviewed · {campaign.remaining_count} left
            </span>
          </div>
          <div className="capacity-track mt-12" style={{ height: 6 }}>
            <div className="capacity-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>

        {inReview && (
          <div className="card card-accent card-pad">
            <div className="label" style={{ color: 'var(--accent)' }}>
              Next up
            </div>

            {loading && <Spinner label="Rendering" />}

            {!loading && !next && (
              <div className="small muted mt-8">Nothing left to review.</div>
            )}

            {!loading && next && (
              <>
                <div className="h3 mt-4">
                  {next.recipient.name} · {next.recipient.org}
                </div>
                <div className="mono tiny muted mt-4">{next.recipient.email}</div>

                <div
                  className="small mt-10"
                  style={{ fontWeight: 600, color: 'var(--text-primary)' }}
                >
                  <ComposedText parts={next.subject_parts} />
                </div>

                <div className="stack gap-10 mt-10 scroll-y" style={{ maxHeight: 220 }}>
                  {next.body_paragraphs.map((paragraph, index) => (
                    <p
                      key={index}
                      className="small secondary"
                      style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
                    >
                      <ComposedText parts={paragraph.parts} />
                    </p>
                  ))}
                </div>

                {next.documents.length > 0 && (
                  <div className="row wrap gap-6 mt-10">
                    {next.documents.map((document) => (
                      <span key={document.id} className="tag">
                        {document.name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="row gap-8 mt-16">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    disabled={!next.can_send || busy}
                    onClick={openAndRecord}
                  >
                    Open in Gmail to send
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ flex: 'none' }}
                    disabled={busy}
                    onClick={skip}
                  >
                    Skip
                  </button>
                </div>

                {!next.can_send && (
                  <div className="small mt-8" style={{ color: 'var(--warning)', fontWeight: 600 }}>
                    Batch limit reached — resets in {resetLabel(next.resets_at) || 'a few hours'}
                  </div>
                )}

                <div className="tiny muted mt-8" style={{ lineHeight: 1.5 }}>
                  Opens a Gmail compose tab pre-filled with this message. Attach the file(s) shown
                  above — Gmail’s compose link can’t attach automatically — and press Gmail’s own
                  Send.
                </div>
              </>
            )}
          </div>
        )}

        {isDone && (
          <div className="card card-success card-pad">
            <div className="small" style={{ fontWeight: 600, color: 'var(--success)' }}>
              All {campaign.total_count} reviewed
            </div>
            <div className="small secondary mt-4">
              Anything you skipped is still in the list — reset to pick it back up.
            </div>
          </div>
        )}

        {campaign.log?.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              className="label"
              style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}
            >
              Activity
            </div>
            {campaign.log.slice(0, 8).map((entry) => (
              <div
                key={entry.id}
                className="row gap-10"
                style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-row)' }}
              >
                <span
                  style={{
                    flex: 'none',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--success)',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate mono tiny">{entry.email}</div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    {entry.note} · {entry.documents_attached} attached
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
