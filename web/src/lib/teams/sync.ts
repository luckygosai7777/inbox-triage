/**
 * Team mailbox sync.
 *
 * First run: backfill the last N days (org setting, default 30), a page or two
 * per run so each run fits a 60s function, resuming from backfill_page_token.
 * The mailbox's historyId is taken BEFORE the backfill starts, so mail that
 * arrives meanwhile is picked up by the first incremental run.
 * After that: history.list from the stored historyId. If Google has expired
 * that history (404), the mailbox drops back to a fresh backfill.
 *
 * Bodies are processed in memory and discarded: only Message-ID metadata
 * (thread_messages) and extracted rows with their quote are written.
 */
import 'server-only';

import { google } from 'googleapis';

import { extractCommitments } from '@/lib/llm';
import { decryptSecret } from '@/lib/crypto';
import { env } from '@/lib/env';
import * as parsing from '@/lib/parsing';
import { adminClient } from '@/lib/supabase';

import { isInternal } from './clients';
import { rowsFromMessage, type TeamMessage } from './extract';
import { answeredSince, threadHeaders, threadKey } from './threads';

// ------------------------------------------------------------ pure helpers

export type ParsedTeamMessage = {
  gmailMessageId: string;
  gmailThreadId: string;
  messageId: string;
  threadKey: string;
  msg: TeamMessage;
};

/** A Gmail `format: full` message, reduced to what the team ledger needs. */
export function toTeamMessage(raw: any, mailboxId: string): ParsedTeamMessage {
  const payload = raw.payload ?? {};
  const headers = parsing.headerMap(payload);
  const from = parsing.splitAddress(headers.from ?? '');
  const body = parsing.extractBodyText(payload);
  const ids = threadHeaders(headers);
  // A message with no Message-ID can't be matched across mailboxes; it still
  // gets a stable id within this one.
  const messageId = ids.messageId || `<gmail-${mailboxId}-${raw.id}>`;
  return {
    gmailMessageId: raw.id,
    gmailThreadId: raw.threadId ?? raw.id,
    messageId,
    threadKey: threadKey(ids) || `<gmail-${mailboxId}-${raw.threadId ?? raw.id}>`,
    msg: {
      fromEmail: from.email.toLowerCase(),
      fromName: from.name,
      toEmails: parsing.splitAddressList(headers.to ?? '').map((a) => a.toLowerCase()),
      ccEmails: parsing.splitAddressList(headers.cc ?? '').map((a) => a.toLowerCase()),
      sentAt: parsing.parseDate(headers.date ?? '', raw.internalDate),
      body,
      senderKind: parsing.senderKind(headers, from.email, body),
      isListMail: parsing.looksLikeListMail(headers),
    },
  };
}

/** Does anyone outside the org take part? Internal-only threads are never stored. */
export function involvesClient(msg: TeamMessage, orgDomains: string[]): boolean {
  return [msg.fromEmail, ...msg.toEmails, ...msg.ccEmails].some((a) => a && !isInternal(a, orgDomains));
}

/**
 * Should THIS mailbox create rows for this message? Our promises come only
 * from the promiser's own mailbox (so Priya's promise is never filed under the
 * teammate she cc'd); a client's mail only from a mailbox it was addressed to.
 * shortcut: a client mail addressed To two teammates goes to whichever mailbox
 * syncs first (dedupe keeps one row). Add an explicit assignee rule if pilots ask.
 */
export function ownsRows(msg: TeamMessage, mailboxEmail: string, orgDomains: string[]): boolean {
  const me = mailboxEmail.toLowerCase();
  return isInternal(msg.fromEmail, orgDomains) ? msg.fromEmail === me : msg.toEmails.includes(me);
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** Retries Gmail's rate-limit and transient errors with exponential backoff. */
export async function withBackoff<T>(
  call: () => Promise<T>,
  tries = 4,
  baseMs = 1000,
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error: any) {
      const status = Number(error?.code ?? error?.status ?? error?.response?.status);
      if (attempt >= tries || !RETRYABLE.has(status)) throw error;
      await sleep(baseMs * 2 ** (attempt - 1));
    }
  }
}

// ----------------------------------------------------------------- I/O side

export type MailboxSyncResult = { status: 'locked' | 'ok' | 'backfilling' | 'error'; messages: number; rows: number };

const LOCK_MS = 5 * 60_000;

export async function syncTeamMailbox(mailboxId: string, budgetMs = 45_000): Promise<MailboxSyncResult> {
  const started = Date.now();
  const db = adminClient() as any;
  const now = new Date();

  // Claim the per-mailbox lock; another job already holding it wins.
  const { data: claimed } = await db
    .from('mailboxes')
    .update({ sync_locked_until: new Date(now.getTime() + LOCK_MS).toISOString() })
    .eq('id', mailboxId)
    .neq('sync_status', 'disconnected')
    .or(`sync_locked_until.is.null,sync_locked_until.lt.${now.toISOString()}`)
    .select('id, org_id, member_id, email, history_id, backfill_page_token, sync_status');
  const mailbox = claimed?.[0];
  if (!mailbox) return { status: 'locked', messages: 0, rows: 0 };

  let result: MailboxSyncResult = { status: 'ok', messages: 0, rows: 0 };
  const update: Record<string, unknown> = {};
  try {
    const [{ data: org }, { data: token }] = await Promise.all([
      db.from('orgs').select('primary_domain, extra_domains, settings').eq('id', mailbox.org_id).single(),
      db.from('mailbox_tokens').select('refresh_token_enc').eq('mailbox_id', mailbox.id).single(),
    ]);
    if (!org || !token) throw new Error('mailbox has no org or token');
    const domains: string[] = [org.primary_domain, ...(org.extra_domains ?? [])];
    const config = env();
    const auth = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: decryptSecret(token.refresh_token_enc) });
    const gmail = google.gmail({ version: 'v1', auth });
    const outOfTime = () => Date.now() - started > budgetMs;

    let ids: string[] = [];
    if (!mailbox.history_id || mailbox.sync_status !== 'ok') {
      // Backfill. Pin the history point first so nothing slips between modes.
      if (!mailbox.history_id) {
        const { data: profile } = await withBackoff(() => gmail.users.getProfile({ userId: 'me' }));
        update.history_id = profile.historyId;
      }
      const days = Number(org.settings?.backfill_days ?? 30);
      let pageToken: string | undefined = mailbox.backfill_page_token ?? undefined;
      do {
        const { data }: any = await withBackoff(() =>
          gmail.users.messages.list({ userId: 'me', q: `newer_than:${days}d`, maxResults: 100, pageToken }),
        );
        ids.push(...(data.messages ?? []).map((m: any) => m.id));
        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken && ids.length < 200 && !outOfTime());
      update.backfill_page_token = pageToken ?? null;
      result.status = pageToken ? 'backfilling' : 'ok';
    } else {
      try {
        let pageToken: string | undefined;
        do {
          const { data }: any = await withBackoff(() =>
            gmail.users.history.list({
              userId: 'me',
              startHistoryId: mailbox.history_id,
              historyTypes: ['messageAdded'],
              pageToken,
            }),
          );
          for (const h of data.history ?? []) for (const a of h.messagesAdded ?? []) ids.push(a.message.id);
          pageToken = data.nextPageToken ?? undefined;
          if (data.historyId) update.history_id = data.historyId;
        } while (pageToken && !outOfTime());
      } catch (error: any) {
        if (Number(error?.code) !== 404) throw error;
        // Google expired our history point: start over from a fresh backfill.
        Object.assign(update, { history_id: null, backfill_page_token: null });
        result.status = 'backfilling';
      }
    }

    ids = [...new Set(ids)];
    result = { ...result, ...(await processMessages(db, gmail, mailbox, domains, ids, outOfTime)) };
  } catch (error: any) {
    const revoked = /invalid_grant/i.test(String(error?.message ?? error));
    console.error('[teams-sync]', mailboxId, revoked ? 'token revoked' : (error?.message ?? error));
    update.sync_error = revoked ? 'Google access was revoked. Reconnect this mailbox.' : 'Sync failed; will retry.';
    result.status = 'error';
  }

  await db
    .from('mailboxes')
    .update({
      ...update,
      sync_status: result.status === 'locked' ? mailbox.sync_status : result.status,
      ...(result.status !== 'error' ? { sync_error: '', last_synced_at: new Date().toISOString() } : {}),
      sync_locked_until: null,
    })
    .eq('id', mailbox.id);
  return result;
}

async function processMessages(
  db: any,
  gmail: any,
  mailbox: { id: string; org_id: string; member_id: string | null; email: string },
  domains: string[],
  ids: string[],
  outOfTime: () => boolean,
): Promise<{ messages: number; rows: number }> {
  let messages = 0;
  let rows = 0;
  const touchedThreads = new Set<string>();

  for (let i = 0; i < ids.length && !outOfTime(); i += 8) {
    const fetched = await Promise.allSettled(
      ids.slice(i, i + 8).map((id) =>
        withBackoff(() => gmail.users.messages.get({ userId: 'me', id, format: 'full' })),
      ),
    );
    for (const f of fetched) {
      if (f.status !== 'fulfilled') continue;
      const parsed = toTeamMessage((f.value as any).data, mailbox.id);
      if (!involvesClient(parsed.msg, domains)) continue;
      messages++;
      touchedThreads.add(parsed.threadKey);

      await db.from('thread_messages').upsert(
        {
          org_id: mailbox.org_id,
          message_id: parsed.messageId,
          thread_key: parsed.threadKey,
          mailbox_id: mailbox.id,
          from_email: parsed.msg.fromEmail,
          from_internal: isInternal(parsed.msg.fromEmail, domains),
          sent_at: parsed.msg.sentAt.toISOString(),
        },
        { onConflict: 'org_id,message_id', ignoreDuplicates: true },
      );

      if (!ownsRows(parsed.msg, mailbox.email, domains)) continue;
      const candidates = await rowsFromMessage(parsed.msg, domains, extractCommitments);
      if (!candidates.length) continue;

      const clientRows = [...new Map(candidates.map((c) => [c.clientKey, c])).values()].map((c) => ({
        org_id: mailbox.org_id,
        key: c.clientKey,
        display_name: c.clientName,
      }));
      await db.from('clients').upsert(clientRows, { onConflict: 'org_id,key', ignoreDuplicates: true });
      const { data: clients } = await db
        .from('clients')
        .select('id, key')
        .eq('org_id', mailbox.org_id)
        .in('key', clientRows.map((c) => c.key));
      const clientId = new Map((clients ?? []).map((c: any) => [c.key, c.id]));

      const { data: inserted } = await db
        .from('ledger_rows')
        .upsert(
          candidates.map((c) => ({
            org_id: mailbox.org_id,
            mailbox_id: mailbox.id,
            owner_member_id: mailbox.member_id,
            client_id: clientId.get(c.clientKey) ?? null,
            direction: c.direction,
            summary: c.summary,
            source_quote: c.sourceQuote,
            source_message_id: parsed.messageId,
            gmail_message_id: parsed.gmailMessageId,
            gmail_thread_id: parsed.gmailThreadId,
            thread_key: parsed.threadKey,
            deadline: c.deadline?.toISOString() ?? null,
            deadline_phrase: c.deadlinePhrase,
            confidence: c.confidence,
          })),
          { onConflict: 'org_id,direction,source_message_id,quote_hash', ignoreDuplicates: true },
        )
        .select('id');
      rows += inserted?.length ?? 0;
    }
  }

  await closeAnsweredAsks(db, mailbox.org_id, [...touchedThreads]);
  return { messages, rows };
}

/** An ask is done once any teammate replied after it, in any connected mailbox. */
async function closeAnsweredAsks(db: any, orgId: string, threadKeys: string[]): Promise<void> {
  if (!threadKeys.length) return;
  const [{ data: asks }, { data: thread }] = await Promise.all([
    db
      .from('ledger_rows')
      .select('id, thread_key, source_message_id')
      .eq('org_id', orgId)
      .eq('direction', 'unanswered_ask')
      .eq('status', 'open')
      .in('thread_key', threadKeys),
    db
      .from('thread_messages')
      .select('message_id, thread_key, from_internal, sent_at')
      .eq('org_id', orgId)
      .in('thread_key', threadKeys),
  ]);
  const byThread = new Map<string, { fromInternal: boolean; sentAt: Date }[]>();
  const sentAt = new Map<string, Date>();
  for (const m of thread ?? []) {
    const entry = { fromInternal: m.from_internal, sentAt: new Date(m.sent_at) };
    byThread.set(m.thread_key, [...(byThread.get(m.thread_key) ?? []), entry]);
    sentAt.set(m.message_id, entry.sentAt);
  }
  const done = (asks ?? [])
    .filter((a: any) => sentAt.has(a.source_message_id))
    .filter((a: any) => answeredSince(byThread.get(a.thread_key) ?? [], sentAt.get(a.source_message_id)!))
    .map((a: any) => a.id);
  if (done.length) await db.from('ledger_rows').update({ status: 'done' }).in('id', done);
}
