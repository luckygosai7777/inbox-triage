'use client';

/**
 * Writing and sending a reply, without leaving the page.
 *
 * Replies used to open a prefilled Gmail tab. That made the app a viewer of
 * your mail rather than a place to work in it, and it meant the drafted reply —
 * the whole point of the product — had to be copied by hand into somewhere
 * else to be useful.
 *
 * Two principles shape what is and is not here:
 *
 *  1. Writing by hand is the default, not the fallback. The box is empty and
 *     focused when it opens. "Write it for me" is a button next to it, for
 *     people who want it, on the messages where it helps. A tool that makes you
 *     accept a machine's words to use it at all is a worse tool.
 *
 *  2. Nothing sends itself. There is one send, it is a button, and the message
 *     is fully visible above it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from './Shell';

type Props = {
  threadId: string;
  /** Who the reply goes to, prefilled. */
  to: string;
  subject: string;
  /** Offered only when there is an inbound message worth answering. */
  canDraft?: boolean;
  /** Called after a successful send so the thread can reload. */
  onSent?: () => void;
};

type Attached = { filename: string; mimeType: string; base64: string; bytes: number };

type DraftMeta = {
  asks: string[];
  gaps: string[];
  tells: string[];
  fromPreviewOnly?: boolean;
  voice: { measuredFrom: number; signOff: string };
};

/** 3 MB per file — see the note on the limit in api/send. */
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 3.5 * 1024 * 1024;

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Browser File → the base64 the send route expects, without the data: prefix. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

export default function Composer({ threadId, to, subject, canDraft = true, onSent }: Props) {
  const { say } = useToast();
  const [open, setOpen] = useState(false);
  const [showCc, setShowCc] = useState(false);

  const [toField, setToField] = useState(to);
  const [ccField, setCcField] = useState('');
  const [bccField, setBccField] = useState('');
  const [subjectField, setSubjectField] = useState(
    subject.startsWith('Re:') ? subject : `Re: ${subject}`,
  );
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<Attached[]>([]);

  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<DraftMeta | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Opening the composer should put the cursor where the writing happens.
  useEffect(() => {
    if (open) bodyRef.current?.focus();
  }, [open]);

  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);

  const attach = useCallback(
    async (picked: FileList | null) => {
      if (!picked?.length) return;
      setError(null);
      const next: Attached[] = [];

      for (const file of Array.from(picked)) {
        if (file.size > MAX_FILE_BYTES) {
          setError(
            `"${file.name}" is ${readableSize(file.size)}. The limit is 3 MB — send a link instead.`,
          );
          continue;
        }
        try {
          next.push({
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64: await readAsBase64(file),
            bytes: file.size,
          });
        } catch (caught) {
          setError((caught as Error).message);
        }
      }

      const combined = [...files, ...next];
      if (combined.reduce((sum, f) => sum + f.bytes, 0) > MAX_TOTAL_BYTES) {
        setError('That would take the total over 3.5 MB. Remove something first.');
        return;
      }
      setFiles(combined);
    },
    [files],
  );

  const writeWithAi = async () => {
    setDrafting(true);
    setError(null);
    try {
      const response = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ thread_id: threadId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not write a draft');

      // Never overwrite words the user has already typed.
      setBody((current) => (current.trim() ? `${current.trim()}\n\n${data.draft}` : data.draft));
      setMeta(data);
      bodyRef.current?.focus();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setDrafting(false);
    }
  };

  const send = async () => {
    if (!body.trim()) {
      setError('The message is empty.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: toField.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
          cc: ccField.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
          bcc: bccField.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
          subject: subjectField,
          body,
          thread_id: threadId,
          attachments: files.map(({ filename, mimeType, base64 }) => ({
            filename,
            mimeType,
            base64,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not send');

      say(`Sent to ${data.to.join(', ')}`);
      setBody('');
      setFiles([]);
      setMeta(null);
      setOpen(false);
      onSent?.();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <div className="card card-pad">
        <div className="row wrap gap-8">
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            Write a reply
          </button>
          {canDraft && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setOpen(true);
                void writeWithAi();
              }}
            >
              Write it for me
            </button>
          )}
          <div className="spacer" />
          <span className="tiny muted" style={{ alignSelf: 'center' }}>
            Sends from your own Gmail account
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="card composer">
      <div className="composer-head">
        <span className="label">Reply</span>
        <div className="spacer" />
        <button
          type="button"
          className="btn btn-xs"
          onClick={() => setOpen(false)}
          aria-label="Close the composer"
        >
          Close
        </button>
      </div>

      <label className="composer-row">
        <span className="composer-key">To</span>
        <input
          className="composer-input"
          value={toField}
          onChange={(event) => setToField(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {!showCc && (
          <button type="button" className="composer-cc" onClick={() => setShowCc(true)}>
            Cc / Bcc
          </button>
        )}
      </label>

      {showCc && (
        <>
          <label className="composer-row">
            <span className="composer-key">Cc</span>
            <input
              className="composer-input"
              value={ccField}
              onChange={(event) => setCcField(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="composer-row">
            <span className="composer-key">Bcc</span>
            <input
              className="composer-input"
              value={bccField}
              onChange={(event) => setBccField(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </>
      )}

      <label className="composer-row">
        <span className="composer-key">Subject</span>
        <input
          className="composer-input"
          value={subjectField}
          onChange={(event) => setSubjectField(event.target.value)}
        />
      </label>

      <textarea
        ref={bodyRef}
        className="composer-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write your reply…"
        spellCheck
        rows={12}
      />

      {files.length > 0 && (
        <div className="composer-files">
          {files.map((file) => (
            <span key={file.filename + file.bytes} className="file-chip">
              <span className="truncate">{file.filename}</span>
              <span className="tiny muted">{readableSize(file.bytes)}</span>
              <button
                type="button"
                onClick={() => setFiles((all) => all.filter((f) => f !== file))}
                aria-label={`Remove ${file.filename}`}
              >
                ×
              </button>
            </span>
          ))}
          <span className="tiny muted" style={{ alignSelf: 'center' }}>
            {readableSize(totalBytes)} of 3.5 MB
          </span>
        </div>
      )}

      {meta && (meta.gaps.length > 0 || meta.tells.length > 0 || meta.fromPreviewOnly) && (
        <div className="composer-notes">
          {meta.gaps.length > 0 && (
            <div>
              <strong style={{ color: 'var(--warning)' }}>Fill in before sending:</strong>{' '}
              {meta.gaps.join(' · ')}
            </div>
          )}
          {meta.tells.length > 0 && (
            <div className="mt-4">
              Reads a little generated — found {meta.tells.map((t) => `"${t}"`).join(', ')}.
            </div>
          )}
          {meta.fromPreviewOnly && (
            <div className="mt-4">
              Gmail would not return the full thread, so this was written from previews only. Worth
              a closer read than usual.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="composer-error" role="alert">
          {error}
        </div>
      )}

      <div className="composer-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={send}
          disabled={sending || !body.trim()}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>

        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
          Attach
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            void attach(event.target.files);
            event.target.value = '';
          }}
        />

        {canDraft && (
          <button type="button" className="btn btn-sm" onClick={writeWithAi} disabled={drafting}>
            {drafting ? 'Reading the thread…' : meta ? 'Rewrite' : 'Write it for me'}
          </button>
        )}

        <div className="spacer" />
        {meta && meta.voice.measuredFrom > 0 && (
          <span className="tiny muted" style={{ alignSelf: 'center' }}>
            Voice from {meta.voice.measuredFrom} of your emails
          </span>
        )}
      </div>
    </div>
  );
}
