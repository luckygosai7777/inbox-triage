/**
 * POST /api/teams/rows/:id/draft — save a reply as a Gmail DRAFT in my own
 * mailbox, threaded onto the source message. Never sends: gmail.compose's
 * drafts.create only. The person opens Gmail, reads it, and sends it there.
 */
import { google } from 'googleapis';
import { z } from 'zod';

import { HttpError, route } from '@/lib/api';
import { buildMimeMessage, toBase64Url } from '@/lib/mime';
import { adminClient } from '@/lib/supabase';
import { isInternal } from '@/lib/teams/clients';
import { audit, memberFor } from '@/lib/teams/context';
import { teamAuth, withBackoff } from '@/lib/teams/sync';

const schema = z.object({ body: z.string().trim().min(1).max(20_000) });

export const POST = route(
  async ({ user, db, input, params }) => {
    const me = await memberFor(user.id);
    // Read through RLS: if I can't see the row, I can't draft on it.
    const { data: row } = await (db as any)
      .from('ledger_rows')
      .select('id, source_message_id')
      .eq('id', params.id)
      .maybeSingle();
    if (!row) throw new HttpError(404, 'Row not found.');

    const admin = adminClient() as any;
    const [{ data: mailbox }, { data: org }] = await Promise.all([
      admin.from('mailboxes').select('id, email').eq('member_id', me.id).neq('sync_status', 'disconnected').maybeSingle(),
      admin.from('orgs').select('primary_domain, extra_domains').eq('id', me.org_id).single(),
    ]);
    if (!mailbox) throw new HttpError(409, 'Connect your mailbox first.');
    const domains = [org.primary_domain, ...(org.extra_domains ?? [])];

    const gmail = google.gmail({ version: 'v1', auth: await teamAuth(mailbox.id) });
    // Gmail ids differ per mailbox, so the message is found in MY mailbox by its Message-ID.
    const bare = row.source_message_id.replace(/^<|>$/g, '');
    const { data: found }: any = await withBackoff(() =>
      gmail.users.messages.list({ userId: 'me', q: `rfc822msgid:${bare}`, maxResults: 1 }),
    );
    const hit = found.messages?.[0];
    if (!hit) throw new HttpError(409, "That thread isn't in your mailbox, so the draft can't be threaded there.");

    const { data: source }: any = await withBackoff(() =>
      gmail.users.messages.get({
        userId: 'me',
        id: hit.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Reply-To', 'Message-ID', 'References'],
      }),
    );
    const header = (name: string) =>
      (source.payload?.headers ?? []).find((h: any) => String(h.name).toLowerCase() === name.toLowerCase())?.value ?? '';
    const addresses = (raw: string) => raw.match(/[^\s<>,;"]+@[^\s<>,;"]+/g) ?? [];
    const from = addresses(header('Reply-To') || header('From'))[0] ?? '';
    // Reply to the client: the sender if they wrote it, else the client we wrote to.
    const to = !isInternal(from, domains) ? from : addresses(header('To')).find((a) => !isInternal(a, domains));
    if (!to) throw new HttpError(409, 'No client address on that message.');
    const subject = header('Subject');

    const raw = buildMimeMessage({
      to: [to],
      subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
      body: input.body,
      fromEmail: mailbox.email,
      fromName: me.name || undefined,
      inReplyTo: header('Message-ID') || row.source_message_id,
      references: [header('References'), header('Message-ID')].filter(Boolean).join(' ') || undefined,
    });
    const { data: draft }: any = await withBackoff(() =>
      gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw: toBase64Url(raw), threadId: hit.threadId } },
      }),
    );
    await audit(me.org_id, me.id, 'draft_created', row.id);
    return {
      ok: true,
      draftId: draft?.id ?? null,
      open: `https://mail.google.com/mail/u/${encodeURIComponent(mailbox.email)}/#drafts`,
    };
  },
  { schema, limit: { bucket: 'teams-draft', max: 60, windowSeconds: 3600 } },
);
