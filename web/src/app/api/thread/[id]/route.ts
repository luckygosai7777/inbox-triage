/**
 * GET /api/thread/[id] — one thread, with every message we hold for it.
 *
 * Body text is fetched live from Gmail rather than stored in full: we keep
 * previews and extracted results, not whole mailboxes. That keeps the amount of
 * correspondence sitting in our database to a minimum, which is both cheaper and
 * a smaller thing to lose.
 */
import { route, HttpError } from '@/lib/api';
import { demoMail, isDemo } from '@/lib/demo';
import { GoogleNotConnected, gmailFor } from '@/lib/gmail';
import { extractBodyText, headerMap, stripQuoted } from '@/lib/parsing';

export const GET = route(async ({ db, user, params }) => {
  const threadId = params.id;
  if (!threadId) throw new HttpError(400, 'Missing thread id');

  if (isDemo()) {
    const messages = demoMail().filter((row) => row.threadId === threadId);
    if (!messages.length) throw new HttpError(404, 'Thread not found');
    return {
      id: threadId,
      subject: messages[0].subject,
      messages: messages.map((row) => ({
        id: row.id,
        fromName: row.fromName,
        fromEmail: row.fromEmail,
        sentAt: row.sentAt,
        isOutbound: false,
        body: `${row.preview}\n\n(Demo mode shows the preview only — connect Gmail for full message text.)`,
        gmailUrl: '#',
      })),
      commitments: [],
    };
  }

  const [{ data: thread }, { data: rows }, { data: commitments }] = await Promise.all([
    db.from('threads').select('id, subject, gmail_thread_id').eq('user_id', user.id).eq('id', threadId).maybeSingle(),
    db
      .from('messages')
      .select('id, gmail_message_id, from_name, from_email, subject, preview, sent_at, is_outbound')
      .eq('user_id', user.id)
      .eq('thread_id', threadId)
      .order('sent_at', { ascending: true }),
    db
      .from('commitments')
      .select('id, direction, what, evidence, due_at, due_text, status')
      .eq('user_id', user.id)
      .eq('thread_id', threadId),
  ]);

  if (!thread) throw new HttpError(404, 'Thread not found');

  // Fetch bodies best-effort. A Gmail outage should degrade to previews, not 500.
  const bodies = new Map<string, string>();
  try {
    const gmail = await gmailFor(user.id);
    const fetched = await Promise.allSettled(
      (rows ?? []).map((row: any) =>
        gmail.users.messages.get({ userId: 'me', id: row.gmail_message_id, format: 'full' }),
      ),
    );
    for (const result of fetched) {
      if (result.status !== 'fulfilled') continue;
      const raw = result.value.data;
      bodies.set(raw.id as string, stripQuoted(extractBodyText(raw.payload, 8000)));
    }
  } catch (error) {
    if (!(error instanceof GoogleNotConnected)) {
      console.warn('[thread] body fetch failed:', (error as Error).message);
    }
  }

  return {
    id: (thread as any).id,
    subject: (thread as any).subject,
    messages: (rows ?? []).map((row: any) => ({
      id: row.id,
      fromName: row.from_name,
      fromEmail: row.from_email,
      sentAt: row.sent_at,
      isOutbound: row.is_outbound,
      body: bodies.get(row.gmail_message_id) || row.preview,
      gmailUrl: `https://mail.google.com/mail/u/0/#all/${(thread as any).gmail_thread_id}`,
    })),
    commitments: (commitments ?? []).map((row: any) => ({
      id: row.id,
      direction: row.direction,
      what: row.what,
      evidence: row.evidence,
      dueAt: row.due_at,
      dueText: row.due_text,
      status: row.status,
    })),
  };
});
