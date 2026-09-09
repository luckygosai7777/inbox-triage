/* Step 3 — the template, the tone, and the live per-recipient preview.
   Anything the model wrote is painted in the accent colour, so it is obvious
   what is yours and what is not. */
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../api/client.js';
import { Chip, ComposedText, Spinner } from '../ui.jsx';

const TOKENS = ['[first]', '[name]', '[org]', '[role]'];
const TONES = ['Formal', 'Warm', 'Direct'];
const INTENSITIES = ['Tokens only', 'Tokens + opener'];

export default function StepMessage({
  campaign,
  useCases,
  patch,
  reload,
  say,
  onNext,
  onBack,
  previewIndex,
  setPreviewIndex,
}) {
  const [subject, setSubject] = useState(campaign.subject_template);
  const [body, setBody] = useState(campaign.body_template);
  const [grounding, setGrounding] = useState(campaign.grounding);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  // Re-seed the local editor state when the campaign template changes beneath
  // us (switching use case rewrites both fields server-side).
  useEffect(() => {
    setSubject(campaign.subject_template);
    setBody(campaign.body_template);
  }, [campaign.subject_template, campaign.body_template]);

  useEffect(() => {
    setGrounding(campaign.grounding);
  }, [campaign.grounding]);

  const recipients = campaign.recipients || [];
  const index = Math.min(previewIndex, Math.max(0, recipients.length - 1));

  const loadPreview = useCallback(async () => {
    if (!recipients.length) {
      setPreview(null);
      return;
    }
    setLoading(true);
    try {
      setPreview(await api.preview(campaign.id, { index }));
    } catch (error) {
      say(error.message);
    } finally {
      setLoading(false);
    }
  }, [campaign.id, index, recipients.length, say]);

  useEffect(() => {
    loadPreview();
  }, [
    loadPreview,
    campaign.tone,
    campaign.intensity,
    campaign.grounding,
    campaign.subject_template,
    campaign.body_template,
  ]);

  const commit = async (fields) => {
    await patch(fields);
  };

  const isGrounded = !!(campaign.grounding || '').trim();
  const tokensOnly = campaign.intensity === 'Tokens only';

  return (
    <div className="row wrap gap-16" style={{ alignItems: 'flex-start' }}>
      <div className="card card-pad" style={{ flex: '1 1 420px', minWidth: 0 }}>
        <div className="label">Kind of message</div>
        <div className="row wrap gap-6 mt-8">
          {useCases.map((useCase) => (
            <Chip
              key={useCase.label}
              small
              active={campaign.use_case === useCase.label}
              onClick={() => commit({ use_case: useCase.label })}
            >
              {useCase.label}
            </Chip>
          ))}
        </div>

        <div className="label mt-20">Subject</div>
        <input
          className="input mt-8"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          onBlur={() => subject !== campaign.subject_template && commit({ subject_template: subject })}
          aria-label="Subject template"
        />

        <div
          className="row wrap gap-8 mt-20"
          style={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span className="label">Prototype message</span>
          <div className="row wrap gap-4">
            {TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                className="btn btn-xs mono"
                onClick={() => {
                  const next = `${body} ${token}`;
                  setBody(next);
                  commit({ body_template: next });
                }}
              >
                {token}
              </button>
            ))}
          </div>
        </div>
        <textarea
          className="textarea mt-8"
          rows={14}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onBlur={() => body !== campaign.body_template && commit({ body_template: body })}
          aria-label="Body template"
        />

        <div className="row wrap gap-16 mt-20">
          <div>
            <div className="label">Tone</div>
            <div className="row gap-6 mt-8">
              {TONES.map((tone) => (
                <Chip
                  key={tone}
                  small
                  active={campaign.tone === tone}
                  onClick={() => commit({ tone })}
                >
                  {tone}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="label">How much AI changes</div>
            <div className="row gap-6 mt-8">
              {INTENSITIES.map((intensity) => (
                <Chip
                  key={intensity}
                  small
                  active={campaign.intensity === intensity}
                  onClick={() => commit({ intensity })}
                >
                  {intensity}
                </Chip>
              ))}
            </div>
          </div>
        </div>
        <div className="small secondary mt-12" style={{ lineHeight: 1.6 }}>
          {tokensOnly
            ? 'Only your own words go out — every changed value comes straight from the CSV.'
            : 'Tokens are filled and one opening line is written per recipient. Nothing else is rewritten.'}
        </div>

        <div
          className="row wrap gap-8 mt-20"
          style={{ justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <span className="label">Source material</span>
          <span
            className="badge"
            style={{ color: isGrounded ? 'var(--success)' : 'var(--warning)' }}
          >
            {isGrounded ? 'Grounded in your source' : 'Not grounded — generic opener'}
          </span>
        </div>
        <textarea
          className="textarea mt-8"
          rows={3}
          placeholder="Paste the job post, the role brief, or a note about these recipients"
          value={grounding}
          onChange={(event) => setGrounding(event.target.value)}
          onBlur={() => grounding !== campaign.grounding && commit({ grounding })}
          aria-label="Source material for the opener"
        />
        <div className="small secondary mt-8" style={{ lineHeight: 1.6 }}>
          {isGrounded
            ? 'The opener quotes this text, so it can only say things you supplied.'
            : 'Without source material the opener is written from a generic bank. It reads as filler and can’t reference anything real — paste the job post, the role brief, or a note about the recipient.'}
        </div>
      </div>

      <aside
        className="stack gap-16"
        style={{ flex: '1 1 360px', minWidth: 0 }}
      >
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-head">
            <div className="h3">Preview per recipient</div>
            <div className="small muted mt-4">
              Orange text is what the model wrote for this person.
            </div>
            <div className="row wrap gap-6 mt-12">
              {recipients.slice(0, 5).map((person, position) => (
                <Chip
                  key={person.id}
                  small
                  active={index === position}
                  onClick={() => setPreviewIndex(position)}
                >
                  {person.name.split(' ')[0]}
                </Chip>
              ))}
            </div>
          </div>

          <div style={{ padding: 16 }}>
            {loading && <Spinner label="Rendering" />}

            {!loading && !preview && (
              <div className="small muted">Add recipients to see a preview.</div>
            )}

            {!loading && preview && (
              <>
                <div className="mono tiny muted">To: {preview.recipient.email}</div>
                <div
                  className="small pretty mt-8"
                  style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}
                >
                  <ComposedText parts={preview.subject_parts} />
                </div>
                <div className="stack gap-12 mt-12">
                  {preview.body_paragraphs.map((paragraph, position) => (
                    <p
                      key={position}
                      className="small"
                      style={{ margin: 0, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}
                    >
                      <ComposedText parts={paragraph.parts} />
                    </p>
                  ))}
                </div>
                {preview.documents.length > 0 && (
                  <div
                    className="row wrap gap-6 mt-16"
                    style={{ paddingTop: 12, borderTop: '1px solid var(--border-light)' }}
                  >
                    {preview.documents.map((document) => (
                      <span key={document.id} className="tag">
                        {document.name}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="row gap-8">
          <button type="button" className="btn" style={{ flex: 'none' }} onClick={onBack}>
            Back
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={onNext}
          >
            Next — sending rules
          </button>
        </div>
      </aside>
    </div>
  );
}
