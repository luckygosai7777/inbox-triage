/* Step 1 — attachments and the rule that decides who gets each one. */
import { useRef, useState } from 'react';

import { api } from '../../api/client.js';

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function StepDocuments({ campaign, reload, say, onNext }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});

  const documents = campaign.documents || [];

  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append('files', file));
      await api.uploadDocuments(campaign.id, form);
      say(`Added ${files.length} file${files.length === 1 ? '' : 's'}`);
      await reload();
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveRule = async (documentId, value) => {
    try {
      await api.updateDocument(campaign.id, documentId, { attach_rule: value });
      await reload();
    } catch (error) {
      say(error.message);
    }
  };

  const remove = async (documentId) => {
    try {
      await api.removeDocument(campaign.id, documentId);
      await reload();
    } catch (error) {
      say(error.message);
    }
  };

  return (
    <div className="row wrap gap-16" style={{ alignItems: 'flex-start' }}>
      <div
        className="card"
        style={{ flex: '1 1 460px', minWidth: 0, padding: 0, overflow: 'hidden' }}
      >
        <div className="card-head">
          <div className="h2">Attachments</div>
          <div className="small muted mt-4">
            Add every file this campaign might need. A rule decides who gets which.
          </div>
        </div>

        {documents.map((document) => (
          <div
            key={document.id}
            className="row wrap gap-12"
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border-row)',
              alignItems: 'flex-start',
            }}
          >
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div
                className="truncate small"
                style={{ fontWeight: 600, color: 'var(--text-primary)' }}
              >
                {document.name}
              </div>
              <div
                className="small"
                style={{
                  marginTop: 3,
                  color: document.attaches_to_all ? 'var(--success)' : 'var(--warning)',
                }}
              >
                {document.rule_label}
                {document.size ? ` · ${formatSize(document.size)}` : ''}
              </div>
            </div>

            <div style={{ flex: '0 1 200px' }}>
              <input
                className="input input-sm"
                placeholder="attach when role contains…"
                value={drafts[document.id] ?? document.attach_rule}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [document.id]: event.target.value }))
                }
                onBlur={(event) => saveRule(document.id, event.target.value)}
                aria-label={`Attach rule for ${document.name}`}
              />
            </div>

            <button
              type="button"
              className="btn btn-sm"
              style={{ flex: 'none' }}
              onClick={() => remove(document.id)}
            >
              Remove
            </button>
          </div>
        ))}

        {!documents.length && (
          <div className="small muted" style={{ padding: '32px 16px', textAlign: 'center' }}>
            No files yet.
          </div>
        )}

        <label style={{ display: 'block', cursor: 'pointer', padding: 16 }}>
          <div className="dropzone">
            {busy ? 'Uploading…' : 'Add documents — PDF, DOCX'}
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx"
            style={{ display: 'none' }}
            onChange={(event) => upload(event.target.files)}
          />
        </label>
      </div>

      <aside className="card card-pad" style={{ flex: '1 1 260px', maxWidth: 320 }}>
        <div className="h3">How rules work</div>
        <div className="small secondary mt-8" style={{ lineHeight: 1.6 }}>
          A blank rule attaches the file to everyone. Type a word —{' '}
          <strong style={{ color: 'var(--accent)' }}>design</strong>,{' '}
          <strong style={{ color: 'var(--accent)' }}>engineer</strong>,{' '}
          <strong style={{ color: 'var(--accent)' }}>marketing</strong> — and that file only goes
          out when the recipient’s role contains it.
        </div>
        <div className="small muted mt-12" style={{ lineHeight: 1.6 }}>
          So a portfolio reaches design leads while the resume reaches everyone, from one run.
        </div>

        <button
          type="button"
          className="btn btn-primary btn-block mt-16"
          disabled={!documents.length}
          onClick={onNext}
        >
          Next — recipients
        </button>
        <div className="small muted mt-8">
          {documents.length
            ? `${documents.length} attached · leave a rule blank to send it to everyone`
            : 'Add at least one document to continue'}
        </div>
      </aside>
    </div>
  );
}
