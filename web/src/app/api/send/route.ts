/**
 * POST /api/send — send a message through the user's own Gmail account.
 *
 * This reverses a constraint that held for most of this project's life: the
 * app deliberately could not send, and replies opened a prefilled Gmail tab.
 * That was the right default while nothing else was proven, and it is the
 * wrong one now — bouncing to another tab to finish the job made the app a
 * viewer of your mail rather than a place to work.
 *
 * What has NOT changed is who decides. Nothing here sends without a person
 * pressing send on a message they can see in full. There is no scheduled send,
 * no send-on-behalf, no automation path into this route. The model writes a
 * draft into a textarea; a human sends it.
 *
 * No new Google permission was needed: gmail.modify, which the app already
 * holds to archive and label, authorises users.messages.send.
 */
import { z } from 'zod';

import { route, HttpError } from '@/lib/api';
import { isDemo } from '@/lib/demo';
import { GoogleNotConnected, gmailFor } from '@/lib/gmail';
import { buildMimeMessage, isEmailish, toBase64Url, type Attachment } from '@/lib/mime';

/*
 * Vercel caps a serverless request body at 4.5MB, and base64 inflates bytes by
 * a third. 3MB of actual file is the honest ceiling for this route; Gmail's own
 * limit is 25MB and reaching it needs a resumable upload, which is a different
 * piece of work. The cap is enforced here rather than left to fail as an opaque
 * 413 at the edge.
 */
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 3.5 * 1024 * 1024;

const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(255).default('application/octet-stream'),
  base64: z.string().max(Math.ceil(MAX_ATTACHMENT_BYTES * 1.4)),
});

const schema = z.object({
  to: z.array(z.string()).min(1).max(50),
  cc: z.array(z.string()).max(50).default([]),
  bcc: z.array(z.string()).max(50).default([]),
  subject: z.string().max(900).default(''),
  body: z.string().min(1).max(100_000),
  /** Gmail thread to attach this to, if it is a reply. */
  thread_id: z.string().uuid().nullable().default(null),
  attachments: z.array(attachmentSchema).max(10).default([]),
});

export const POST = route<z.infer<typeof schema>>(
  async ({ db, user, input }) => {
    if (isDemo()) {
      throw new HttpError(400, 'Sending needs a real mailbox. Connect Gmail to try it.');
    }

    const to = input.to.filter(isEmailish);
    if (!to.length) throw new HttpError(400, 'Add at least one valid recipient.');

    const cc = input.cc.filter(isEmailish);
    const bcc = input.bcc.filter(isEmailish);

    // Size is checked before anything expensive happens.
    let total = 0;
    for (const file of input.attachments) {
      const bytes = Math.floor((file.base64.length * 3) / 4);
      if (bytes > MAX_ATTACHMENT_BYTES) {
        throw new HttpError(
          413,
          `"${file.filename}" is larger than 3 MB, which is the most this can send. Share a link instead.`,
        );
      }
      total += bytes;
    }
    if (total > MAX_TOTAL_BYTES) {
      throw new HttpError(413, 'Those attachments total more than 3.5 MB. Remove one and try again.');
    }

    /*
     * Threading.
     *
     * Gmail's threadId groups the reply in the SENDER's mailbox only. For it to
     * thread in the recipient's client — which may not be Gmail — the message
     * needs In-Reply-To and References carrying the original RFC Message-ID,
     * which is a header on the message rather than anything we store. So it is
     * read back from Gmail here, cheaply, using a metadata-only fetch.
     */
    let gmailThreadId: string | undefined;
    let inReplyTo: string | undefined;
    let references: string | undefined;

    let gmail;
    try {
      gmail = await gmailFor(user.id);
    } catch (error) {
      if (error instanceof GoogleNotConnected) throw new HttpError(409, error.message);
      throw error;
    }

    if (input.thread_id) {
      const { data: thread } = await db
        .from('threads')
        .select('gmail_thread_id')
        .eq('user_id', user.id)
        .eq('id', input.thread_id)
        .maybeSingle();

      if (thread) {
        gmailThreadId = (thread as any).gmail_thread_id;

        const { data: last } = await db
          .from('messages')
          .select('gmail_message_id')
          .eq('user_id', user.id)
          .eq('thread_id', input.thread_id)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (last) {
          try {
            const { data: raw } = await gmail.users.messages.get({
              userId: 'me',
              id: (last as any).gmail_message_id,
              format: 'metadata',
              metadataHeaders: ['Message-ID', 'References'],
            });
            const headers: any[] = (raw as any).payload?.headers ?? [];
            const find = (name: string) =>
              headers.find((h) => String(h.name).toLowerCase() === name.toLowerCase())?.value;
            inReplyTo = find('Message-ID') || undefined;
            references = find('References') || undefined;
          } catch (error) {
            // Losing the chain costs threading on the recipient's side, which
            // is worth degrading over rather than refusing to send.
            console.warn('[send] could not read thread headers:', (error as Error).message);
          }
        }
      }
    }

    const { data: profile } = await db
      .from('profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .maybeSingle();

    const fromEmail = (profile as any)?.email || user.email || '';
    if (!fromEmail) throw new HttpError(409, 'No sending address on this account.');

    const raw = buildMimeMessage({
      to,
      cc,
      bcc,
      subject: input.subject,
      body: input.body,
      fromEmail,
      fromName: (profile as any)?.full_name || undefined,
      inReplyTo,
      references,
      attachments: input.attachments as Attachment[],
    });

    try {
      const { data } = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: toBase64Url(raw),
          ...(gmailThreadId ? { threadId: gmailThreadId } : {}),
        },
      });

      return {
        sent: true,
        id: (data as any)?.id ?? null,
        threadId: (data as any)?.threadId ?? null,
        to,
        // Threading in the recipient's client is the part that silently fails,
        // so the caller is told whether it was achieved.
        threaded: Boolean(inReplyTo),
      };
    } catch (error: any) {
      const detail = error?.errors?.[0]?.message ?? error?.message ?? '';
      console.warn('[send] gmail rejected:', error?.code ?? '', detail);

      if (error?.code === 403 || /insufficient/i.test(detail)) {
        throw new HttpError(
          403,
          'Google has not granted permission to send. Open Settings and reconnect your account.',
        );
      }
      if (error?.code === 400) {
        throw new HttpError(400, `Gmail rejected the message: ${detail || 'malformed'}`);
      }
      if (error?.code === 429 || /rate|quota/i.test(detail)) {
        throw new HttpError(429, 'Gmail is rate limiting this account. Wait a minute.');
      }
      throw new HttpError(502, 'Gmail would not accept the message. Nothing was sent.');
    }
  },
  {
    schema,
    // Generous for a person, ruinous for a script. A stolen session must not
    // become a way to mail this user's clients.
    limit: { bucket: 'send', max: 40, windowSeconds: 3600 },
  },
);

export const maxDuration = 60;
