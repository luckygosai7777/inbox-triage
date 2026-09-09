/* Step 2 — the recipient list: CSV import, the table, and adding one by hand. */
import { useRef, useState } from 'react';

import { api } from '../../api/client.js';

const BLANK = { email: '', name: '', org: '', role: '' };

export default function StepRecipients({ campaign, reload, say, onNext, onBack }) {
  const fileRef = useRef(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');

  const recipients = campaign.recipients || [];
  const emailValid = /.+@.+\..+/.test(form.email.trim());
  const nameValid = form.name.trim().length > 1;

  const importText = async (text, listName) => {
    setBusy(true);
    try {
      const result = await api.importRecipients(campaign.id, {
        text,
        list_name: listName || '',
        replace: true,
      });
      const skipped = result.skipped_count
        ? ` · skipped ${result.skipped_count}`
        : '';
      say(`Imported ${result.imported} recipients${skipped}`);
      setPasted('');
      setPasting(false);
      await reload();
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    await importText(text, file.name);
  };

  const addOne = async () => {
    if (!emailValid || !nameValid || busy) return;
    setBusy(true);
    try {
      await api.addRecipient(campaign.id, {
        email: form.email.trim(),
        name: form.name.trim(),
        org: form.org.trim(),
        role: form.role.trim(),
      });
      say(`Added ${form.name.trim()} to the queue`);
      setForm(BLANK);
      await reload();
    } catch (error) {
      say(error.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (recipientId) => {
    try {
      await api.removeRecipient(campaign.id, recipientId);
      await reload();
    } catch (error) {
      say(error.message);
    }
  };

  const hint = !emailValid
    ? 'An address is required'
    : !nameValid
      ? 'A name is required — the message opens with it'
      : 'Added to the end of the list';

  return (
    <div className="row wrap gap-16" style={{ alignItems: 'flex-start' }}>
      <div
        className="card"
        style={{ flex: '1 1 520px', minWidth: 0, padding: 0, overflow: 'hidden' }}
      >
        <div
          className="card-head row wrap gap-12"
          style={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div>
            <div className="h2">{campaign.list_name || 'No list loaded'}</div>
            <div className="small muted mt-4">
              {recipients.length} recipients · every column mapped
            </div>
          </div>
          <div className="row gap-8">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setPasting((value) => !value)}
            >
              Paste CSV
            </button>
            <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
              {recipients.length ? 'Replace CSV' : 'Upload CSV'}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,.tsv"
                style={{ display: 'none' }}
                onChange={(event) => onFile(event.target.files?.[0])}
              />
            </label>
          </div>
        </div>

        {pasting && (
          <div style={{ padding: 16, borderBottom: '1px solid var(--border-light)' }}>
            <textarea
              className="textarea"
              rows={5}
              placeholder={'email,name,org,role\nnadia@northwind.studio,Nadia Faruk,Northwind,Design Lead'}
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              aria-label="Paste CSV rows"
            />
            <div className="row gap-8 mt-8">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!pasted.trim() || busy}
                onClick={() => importText(pasted, 'pasted.csv')}
              >
                Import rows
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPasting(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="scroll-y" style={{ maxHeight: 420 }}>
          {recipients.map((person) => (
            <div
              key={person.id}
              className="striped row wrap gap-12"
              style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)' }}
            >
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <div className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {person.name}
                </div>
                <div className="truncate mono tiny muted" style={{ marginTop: 3 }}>
                  {person.email}
                </div>
              </div>

              <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                <div className="small">{person.org}</div>
                <div className="small muted" style={{ marginTop: 3 }}>
                  {person.role}
                </div>
              </div>

              <div
                className="stack gap-4"
                style={{ flex: 'none', alignItems: 'flex-end' }}
              >
                <span
                  className="tiny"
                  style={{
                    fontWeight: 600,
                    color: person.sent_at ? 'var(--success)' : 'var(--text-tertiary)',
                  }}
                >
                  {person.status_label}
                </span>
                <span className="mono tiny muted">{person.document_count} file(s)</span>
              </div>

              {!person.sent_at && (
                <button
                  type="button"
                  className="btn-icon"
                  style={{ flex: 'none' }}
                  onClick={() => remove(person.id)}
                  title="Remove from list"
                  aria-label={`Remove ${person.email}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {!recipients.length && (
            <div className="small muted" style={{ padding: '32px 16px', textAlign: 'center' }}>
              No recipients yet. Upload or paste a CSV, or add one by hand below.
            </div>
          )}
        </div>

        <div
          style={{ padding: 16, borderTop: '1px solid var(--border-light)', background: '#131317' }}
        >
          <div className="label">Add one by hand</div>
          <div
            className="mt-10"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 8,
            }}
          >
            {[
              ['email', 'name@company.com'],
              ['name', 'Full name'],
              ['org', 'Organisation (optional)'],
              ['role', 'Role (optional)'],
            ].map(([field, placeholder]) => (
              <input
                key={field}
                className="input input-sm"
                placeholder={placeholder}
                value={form[field]}
                onChange={(event) =>
                  setForm((current) => ({ ...current, [field]: event.target.value }))
                }
                aria-label={placeholder}
              />
            ))}
          </div>
          <div className="row wrap gap-12 mt-10">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!emailValid || !nameValid || busy}
              onClick={addOne}
            >
              Add to queue
            </button>
            <span className="small secondary">{hint}</span>
          </div>
        </div>
      </div>

      <aside className="card card-pad" style={{ flex: '1 1 260px', maxWidth: 320 }}>
        <div className="h3">Detected columns</div>
        <div className="stack gap-6 mt-12">
          {['email', 'name', 'org', 'role'].map((field) => {
            const filled = recipients.filter((person) => (person[field] || '').trim()).length;
            return (
              <div
                key={field}
                className="row gap-8"
                style={{
                  justifyContent: 'space-between',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 10px',
                }}
              >
                <span className="mono" style={{ color: 'var(--accent)' }}>
                  [{field}]
                </span>
                <span
                  className="tiny"
                  style={{
                    fontWeight: 600,
                    color: filled === recipients.length && filled > 0
                      ? 'var(--success)'
                      : 'var(--text-tertiary)',
                  }}
                >
                  {filled} filled
                </span>
              </div>
            );
          })}
        </div>
        <div className="small muted mt-12" style={{ lineHeight: 1.6 }}>
          These become the tokens you can drop into the message. Any missing value falls back to a
          neutral phrase rather than an empty gap.
        </div>

        <button
          type="button"
          className="btn btn-primary btn-block mt-16"
          disabled={!recipients.length}
          onClick={onNext}
        >
          Next — write the message
        </button>
        <button type="button" className="btn btn-ghost btn-block mt-8" onClick={onBack}>
          Back
        </button>
      </aside>
    </div>
  );
}
