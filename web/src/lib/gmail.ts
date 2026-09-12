/**
 * Gmail and Google Calendar sync.
 *
 * `syncMailbox` pulls recent INBOX and SENT mail. SENT matters because the
 * Commitment Ledger is built from what the user promised, and that only exists
 * in their outbound mail — this is the part other inbox tools never read.
 *
 * Every write is an upsert keyed on the Gmail message id, so re-running is safe.
 * Already-classified messages are not re-sent to the model.
 */
import 'server-only';

import { google } from 'googleapis';

import { adminClient } from './supabase';
import { decryptSecret } from './crypto';
import { env } from './env';
import {
  classifyMessages,
  clampCategory,
  extractCommitments,
  parseBrief,
  type ClassifyInput,
} from './llm';
import { looksResolved } from './commitments';
import * as parsing from './parsing';

const METADATA_HEADERS = [
  'From', 'To', 'Cc', 'Subject', 'Date',
  'List-Unsubscribe', 'List-Id', 'Precedence', 'X-Campaign-Id',
];

export class GoogleNotConnected extends Error {}

export type SyncResult = {
  fetched: number;
  created: number;
  updated: number;
  classified: number;
  briefs: number;
  commitments: number;
  errors: string[];
};

async function oauthClient(userId: string) {
  const config = env();
  const db = adminClient();

  const { data } = await db
    .from('profiles')
    .select('google_refresh_token_enc')
    .eq('id', userId)
    .maybeSingle();

  const encrypted = (data as any)?.google_refresh_token_enc as string | null;
  if (!encrypted) {
    throw new GoogleNotConnected(
      'No Google account connected. Sign in with Google to grant mailbox access.',
    );
  }
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    throw new GoogleNotConnected('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured.');
  }

  const client = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: decryptSecret(encrypted) });
  return client;
}

export async function gmailFor(userId: string) {
  return google.gmail({ version: 'v1', auth: await oauthClient(userId) });
}

export async function calendarFor(userId: string) {
  return google.calendar({ version: 'v3', auth: await oauthClient(userId) });
}

// ------------------------------------------------------------------ fetching

async function listIds(gmail: any, label: string, max: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < max) {
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      labelIds: [label],
      maxResults: Math.min(100, max - ids.length),
      pageToken,
    });
    for (const message of data.messages ?? []) if (message.id) ids.push(message.id);
    pageToken = data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return ids.slice(0, max);
}

async function fetchMessages(gmail: any, ids: string[]): Promise<any[]> {
  // Sequential-with-concurrency rather than the batch endpoint: some Workspace
  // configurations reject batch, and a predictable sync beats a failing one.
  const CONCURRENCY = 8;
  const out: any[] = [];

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((id) => gmail.users.messages.get({ userId: 'me', id, format: 'full' })),
    );
    for (const result of settled) {
      if (result.status === 'fulfilled') out.push(result.value.data);
    }
  }
  return out;
}

export type ParsedMessage = {
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string;
  toEmails: string[];
  subject: string;
  preview: string;
  sentAt: Date;
  isUnread: boolean;
  isArchived: boolean;
  isOutbound: boolean;
  hasAttachment: boolean;
  body: string;
  isListMail: boolean;
  senderKind: parsing.SenderKind;
  listUnsubscribe: string;
};

export function parseMessage(raw: any, isOutbound: boolean): ParsedMessage {
  const payload = raw.payload ?? {};
  const headers = parsing.headerMap(payload);
  const from = parsing.splitAddress(headers.from ?? '');
  const body = parsing.extractBodyText(payload);
  const labels: string[] = raw.labelIds ?? [];

  return {
    gmailMessageId: raw.id,
    gmailThreadId: raw.threadId ?? raw.id,
    fromEmail: from.email,
    fromName: from.name,
    toEmails: parsing.splitAddressList(headers.to ?? ''),
    subject: (headers.subject ?? '').slice(0, 900),
    preview: parsing.makePreview(raw.snippet ?? '', body),
    sentAt: parsing.parseDate(headers.date ?? '', raw.internalDate),
    isUnread: labels.includes('UNREAD'),
    isArchived: !labels.includes('INBOX') && !isOutbound,
    isOutbound,
    hasAttachment: parsing.hasAttachment(payload),
    body,
    isListMail: parsing.looksLikeListMail(headers),
    senderKind: parsing.senderKind(headers, from.email, body),
    listUnsubscribe: (headers['list-unsubscribe'] ?? '').slice(0, 1000),
  };
}

// ------------------------------------------------------------------- syncing

export async function syncMailbox(userId: string, maxResults?: number): Promise<SyncResult> {
  const config = env();
  const limit = maxResults ?? config.GMAIL_SYNC_MAX_RESULTS;
  const db = adminClient();
  const gmail = await gmailFor(userId);

  const result: SyncResult = {
    fetched: 0, created: 0, updated: 0, classified: 0, briefs: 0, commitments: 0, errors: [],
  };

  const [inboxIds, sentIds] = await Promise.all([
    listIds(gmail, 'INBOX', limit),
    // Half as much sent mail: it feeds the Ledger, not the inbox list.
    listIds(gmail, 'SENT', Math.max(10, Math.floor(limit / 2))),
  ]);

  const [inboxRaw, sentRaw] = await Promise.all([
    fetchMessages(gmail, inboxIds),
    fetchMessages(gmail, sentIds),
  ]);

  const parsed = [
    ...inboxRaw.map((raw) => parseMessage(raw, false)),
    ...sentRaw.map((raw) => parseMessage(raw, true)),
  ];
  result.fetched = parsed.length;

  // --- threads ------------------------------------------------------------
  const threadIds = [...new Set(parsed.map((m) => m.gmailThreadId))];
  const threadRows = threadIds.map((gmailThreadId) => {
    const messages = parsed.filter((m) => m.gmailThreadId === gmailThreadId);
    const latest = messages.reduce((a, b) => (a.sentAt > b.sentAt ? a : b));
    return {
      user_id: userId,
      gmail_thread_id: gmailThreadId,
      subject: latest.subject,
      latest_at: latest.sentAt.toISOString(),
      is_open: !latest.isArchived,
    };
  });

  const { data: threads, error: threadError } = await db
    .from('threads')
    .upsert(threadRows, { onConflict: 'user_id,gmail_thread_id' })
    .select('id, gmail_thread_id');
  if (threadError) throw new Error(`threads: ${threadError.message}`);

  const threadIdByGmail = new Map(
    (threads ?? []).map((t: any) => [t.gmail_thread_id as string, t.id as string]),
  );

  // --- messages -----------------------------------------------------------
  const { data: existing } = await db
    .from('messages')
    .select('gmail_message_id, classified_at, category, needs_reply')
    .eq('user_id', userId)
    .in('gmail_message_id', parsed.map((m) => m.gmailMessageId));

  const alreadyClassified = new Set(
    (existing ?? []).filter((r: any) => r.classified_at).map((r: any) => r.gmail_message_id),
  );
  const knownIds = new Set((existing ?? []).map((r: any) => r.gmail_message_id));
  const storedById = new Map(
    (existing ?? []).map((r: any) => [r.gmail_message_id as string, r]),
  );

  const messageRows = parsed.map((m) => ({
    user_id: userId,
    thread_id: threadIdByGmail.get(m.gmailThreadId)!,
    gmail_message_id: m.gmailMessageId,
    from_email: m.fromEmail,
    from_name: m.fromName,
    to_emails: m.toEmails,
    subject: m.subject,
    preview: m.preview,
    sent_at: m.sentAt.toISOString(),
    is_unread: m.isUnread,
    is_archived: m.isArchived,
    is_outbound: m.isOutbound,
    has_attachment: m.hasAttachment,
  }));

  const { data: saved, error: messageError } = await db
    .from('messages')
    .upsert(messageRows, { onConflict: 'user_id,gmail_message_id' })
    .select('id, gmail_message_id');
  if (messageError) throw new Error(`messages: ${messageError.message}`);

  result.created = messageRows.filter((r) => !knownIds.has(r.gmail_message_id)).length;
  result.updated = messageRows.length - result.created;

  const rowIdByGmail = new Map(
    (saved ?? []).map((r: any) => [r.gmail_message_id as string, r.id as string]),
  );

  // --- classification (inbound only) --------------------------------------
  const toClassify = parsed.filter(
    (m) => !m.isOutbound && !alreadyClassified.has(m.gmailMessageId),
  );

  // Everyone this mailbox has ever written to. The single best signal for
  // "is this a real relationship or a stranger", and it is free — we sync sent
  // mail for the ledger anyway.
  const correspondents = await knownCorrespondents(userId, parsed);

  if (toClassify.length) {
    const inputs: ClassifyInput[] = toClassify.map((m) => ({
      id: m.gmailMessageId,
      fromName: m.fromName,
      fromEmail: m.fromEmail,
      subject: m.subject,
      preview: m.preview,
      body: m.body,
      isListMail: m.isListMail,
      senderKind: m.senderKind,
      hasCorresponded: correspondents.has(m.fromEmail.toLowerCase()),
    }));

    const classifications = await classifyMessages(inputs);
    const now = new Date().toISOString();

    for (const message of toClassify) {
      const c = classifications.get(message.gmailMessageId);
      if (!c) continue;
      await db
        .from('messages')
        .update({
          priority: c.priority,
          needs_reply: c.needsReply,
          category: c.category,
          effort_minutes: c.effortMinutes,
          topics: c.topics,
          due_at: c.dueAt ? c.dueAt.toISOString() : null,
          classified_at: now,
        })
        .eq('user_id', userId)
        .eq('gmail_message_id', message.gmailMessageId);
      result.classified += 1;
    }
  }

  // --- repair (free, no model call) ----------------------------------------
  //
  // Rows classified before the sender rules existed keep whatever they were
  // given, because sync never re-classifies. That left real mailboxes with a
  // Google security alert filed under Clients and no way to shift it. The
  // header facts are in hand for every message we just fetched, so any stored
  // category that contradicts them is corrected here — no tokens, no waiting.
  const toRepair = parsed.filter(
    (m) => !m.isOutbound && alreadyClassified.has(m.gmailMessageId),
  );

  for (const message of toRepair) {
    const stored = storedById.get(message.gmailMessageId);
    if (!stored) continue;

    const category = clampCategory(stored.category, message.senderKind, {
      text: message.subject + message.preview,
      hasCorresponded: correspondents.has(message.fromEmail.toLowerCase()),
    });
    // Only a person can owe you a reply.
    const needsReply = message.senderKind === 'person' && Boolean(stored.needs_reply);

    if (category === stored.category && needsReply === Boolean(stored.needs_reply)) continue;

    await db
      .from('messages')
      .update({
        category,
        needs_reply: needsReply,
        ...(needsReply ? {} : { due_at: null, priority: 2 }),
      })
      .eq('user_id', userId)
      .eq('gmail_message_id', message.gmailMessageId);
    result.classified += 1;
  }

  await syncSubscriptions(userId, parsed);
  result.commitments = await syncCommitments(userId, parsed, rowIdByGmail, threadIdByGmail);
  result.briefs = await syncBriefs(userId, parsed, threadIdByGmail);

  await db.from('profiles').update({ last_synced_at: new Date().toISOString() }).eq('id', userId);
  return result;
}

/**
 * Addresses the mailbox owner has sent mail to — from this sync and from
 * everything already stored.
 */
async function knownCorrespondents(
  userId: string,
  parsed: ParsedMessage[],
): Promise<Set<string>> {
  const known = new Set<string>();

  for (const message of parsed) {
    if (!message.isOutbound) continue;
    for (const address of message.toEmails) known.add(address.toLowerCase());
  }

  try {
    const db = adminClient();
    const { data } = await db
      .from('messages')
      .select('to_emails')
      .eq('user_id', userId)
      .eq('is_outbound', true)
      .limit(2000);
    for (const row of (data ?? []) as any[]) {
      for (const address of row.to_emails ?? []) known.add(String(address).toLowerCase());
    }
  } catch (error) {
    // Worst case the classifier is more cautious and files someone as Other.
    console.warn('[sync] correspondent lookup failed:', (error as Error).message);
  }

  return known;
}

// -------------------------------------------------------------- commitments

async function syncCommitments(
  userId: string,
  parsed: ParsedMessage[],
  rowIdByGmail: Map<string, string>,
  threadIdByGmail: Map<string, string>,
): Promise<number> {
  const db = adminClient();

  // Only look at messages we have not already mined.
  const { data: seen } = await db
    .from('commitments')
    .select('message_id')
    .eq('user_id', userId);
  const minedMessageIds = new Set((seen ?? []).map((r: any) => r.message_id));

  // Outbound = promises the user made. Newest first, capped so a first sync
  // does not spend the entire LLM budget in one request.
  const outbound = parsed
    .filter((m) => m.isOutbound)
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
    .filter((m) => !minedMessageIds.has(rowIdByGmail.get(m.gmailMessageId)))
    .slice(0, 15);

  // Inbound asks: only where the thread's latest message is still inbound,
  // which is the structural signal that the user never replied.
  const latestByThread = new Map<string, ParsedMessage>();
  for (const message of parsed) {
    const current = latestByThread.get(message.gmailThreadId);
    if (!current || message.sentAt > current.sentAt) {
      latestByThread.set(message.gmailThreadId, message);
    }
  }
  const unanswered = parsed
    // Only a person can be waiting on you. An automated "action required"
    // notice is not owed an answer, and a ledger with one in it is a ledger
    // people stop opening.
    .filter((m) => !m.isOutbound && m.senderKind === 'person')
    .filter((m) => latestByThread.get(m.gmailThreadId)?.gmailMessageId === m.gmailMessageId)
    .filter((m) => !minedMessageIds.has(rowIdByGmail.get(m.gmailMessageId)))
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
    .slice(0, 10);

  const rows: any[] = [];

  for (const message of outbound) {
    const recipient = message.toEmails[0] ?? '';
    const found = await extractCommitments({
      body: message.body,
      direction: 'owed',
      counterparty: parsing.splitAddress(recipient).name,
      counterpartyEmail: recipient,
    });
    for (const commitment of found) {
      rows.push(toRow(userId, commitment, message, rowIdByGmail, threadIdByGmail));
    }
  }

  for (const message of unanswered) {
    const found = await extractCommitments({
      body: message.body,
      direction: 'awaiting',
      counterparty: message.fromName,
      counterpartyEmail: message.fromEmail,
    });
    for (const commitment of found) {
      rows.push(toRow(userId, commitment, message, rowIdByGmail, threadIdByGmail));
    }
  }

  if (rows.length) {
    const { error } = await db.from('commitments').insert(rows);
    if (error) console.warn('[sync] commitments insert:', error.message);
  }

  await flagResolved(userId, parsed);
  return rows.length;
}

function toRow(
  userId: string,
  commitment: any,
  message: ParsedMessage,
  rowIdByGmail: Map<string, string>,
  threadIdByGmail: Map<string, string>,
) {
  return {
    user_id: userId,
    thread_id: threadIdByGmail.get(message.gmailThreadId) ?? null,
    message_id: rowIdByGmail.get(message.gmailMessageId) ?? null,
    direction: commitment.direction,
    what: commitment.what,
    counterparty: commitment.counterparty,
    counterparty_email: commitment.counterpartyEmail,
    evidence: commitment.evidence,
    due_at: commitment.dueAt ? commitment.dueAt.toISOString() : null,
    due_text: commitment.dueText,
    confidence: commitment.confidence,
  };
}

/**
 * Marks open commitments whose thread has since seen a message that looks like
 * delivery. This only sets a hint — the user decides whether it is done.
 */
async function flagResolved(userId: string, parsed: ParsedMessage[]): Promise<void> {
  const db = adminClient();
  const { data: open } = await db
    .from('commitments')
    .select('id, what, evidence, thread_id, created_at')
    .eq('user_id', userId)
    .eq('status', 'open')
    .eq('auto_resolved_hint', false);

  if (!open?.length) return;

  const { data: threads } = await db
    .from('threads')
    .select('id, gmail_thread_id')
    .eq('user_id', userId);
  const gmailByThread = new Map((threads ?? []).map((t: any) => [t.id, t.gmail_thread_id]));

  const hits: string[] = [];
  for (const row of open as any[]) {
    const gmailThreadId = gmailByThread.get(row.thread_id);
    if (!gmailThreadId) continue;
    const later = parsed.filter(
      (m) =>
        m.gmailThreadId === gmailThreadId &&
        m.isOutbound &&
        m.sentAt.getTime() > new Date(row.created_at).getTime(),
    );
    if (later.some((m) => looksResolved({ what: row.what, evidence: row.evidence }, m.body))) {
      hits.push(row.id);
    }
  }

  if (hits.length) {
    await db.from('commitments').update({ auto_resolved_hint: true }).in('id', hits);
  }
}

// ------------------------------------------------------------------- briefs

async function syncBriefs(
  userId: string,
  parsed: ParsedMessage[],
  threadIdByGmail: Map<string, string>,
): Promise<number> {
  const db = adminClient();
  const { data: vips } = await db.from('vip_senders').select('email').eq('user_id', userId);
  const vipEmails = new Set((vips ?? []).map((v: any) => String(v.email).toLowerCase()));
  if (!vipEmails.size) return 0;

  const candidates = parsed
    .filter((m) => !m.isOutbound && !m.isArchived && vipEmails.has(m.fromEmail))
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
    .slice(0, 5);

  let count = 0;
  for (const message of candidates) {
    const threadId = threadIdByGmail.get(message.gmailThreadId);
    if (!threadId) continue;

    const brief = await parseBrief({
      id: message.gmailMessageId,
      fromName: message.fromName,
      fromEmail: message.fromEmail,
      subject: message.subject,
      preview: message.preview,
      body: message.body,
    });

    await db
      .from('threads')
      .update({
        brief_ask: brief.ask,
        brief_why: brief.why,
        brief_evidence: brief.evidence,
        brief_due_at: brief.dueAt ? brief.dueAt.toISOString() : null,
        brief_due_text: brief.dueText,
        brief_confidence: brief.confidence,
        brief_parsed_at: new Date().toISOString(),
      })
      .eq('id', threadId);
    count += 1;
  }
  return count;
}

// ------------------------------------------------------------ subscriptions

async function syncSubscriptions(userId: string, parsed: ParsedMessage[]): Promise<void> {
  const db = adminClient();
  const bySender = new Map<string, ParsedMessage[]>();
  for (const message of parsed) {
    if (!message.isListMail || message.isOutbound || !message.fromEmail) continue;
    const list = bySender.get(message.fromEmail) ?? [];
    list.push(message);
    bySender.set(message.fromEmail, list);
  }
  if (!bySender.size) return;

  const rows = [...bySender.entries()].map(([email, messages]) => {
    const newest = messages.reduce((a, b) => (a.sentAt > b.sentAt ? a : b));
    return {
      user_id: userId,
      sender_email: email,
      sender_name: newest.fromName || email,
      list_unsubscribe: newest.listUnsubscribe,
      last_activity_at: newest.sentAt.toISOString(),
    };
  });

  await db.from('subscriptions').upsert(rows, { onConflict: 'user_id,sender_email' });
  await refreshSubscriptionStats(userId);
}

/** Recomputes per-window engagement from stored mail. */
export async function refreshSubscriptionStats(userId: string): Promise<void> {
  const db = adminClient();
  const { data: subs } = await db
    .from('subscriptions')
    .select('id, sender_email, window_stats')
    .eq('user_id', userId);
  if (!subs?.length) return;

  const now = Date.now();
  for (const sub of subs as any[]) {
    const { data: messages } = await db
      .from('messages')
      .select('sent_at, is_unread, is_archived')
      .eq('user_id', userId)
      .eq('from_email', sub.sender_email);

    const stats: Record<string, number[]> = {};
    for (const window of [30, 90, 180]) {
      const since = now - window * 86_400_000;
      const inWindow = (messages ?? []).filter(
        (m: any) => new Date(m.sent_at).getTime() >= since,
      );
      const opened = inWindow.filter((m: any) => !m.is_unread).length;
      const dismissed = inWindow.filter((m: any) => m.is_unread && m.is_archived).length;
      // Clicks are not observable from the Gmail API; only the user can mark
      // one, so the existing count is preserved rather than recomputed.
      const existingClicks = Number((sub.window_stats ?? {})[String(window)]?.[1] ?? 0);
      stats[String(window)] = [opened, existingClicks, dismissed];
    }

    const ninetyDayCount = (messages ?? []).filter(
      (m: any) => new Date(m.sent_at).getTime() >= now - 90 * 86_400_000,
    ).length;

    await db
      .from('subscriptions')
      .update({
        window_stats: stats,
        opens_count: (messages ?? []).filter((m: any) => !m.is_unread).length,
        dismissals_count: (messages ?? []).filter((m: any) => m.is_unread && m.is_archived).length,
        messages_per_month: Math.round(ninetyDayCount / 3),
      })
      .eq('id', sub.id);
  }
}

// ---------------------------------------------------------------- calendar

export async function syncCalendar(userId: string, day = new Date()): Promise<number> {
  const db = adminClient();
  const calendar = await calendarFor(userId);

  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data } = await calendar.events.list({
    calendarId: 'primary',
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const isoDay = start.toISOString().slice(0, 10);
  await db.from('calendar_slots').delete().eq('user_id', userId).eq('day', isoDay);

  const rows = (data.items ?? [])
    .filter((event) => event.start?.dateTime && event.end?.dateTime)
    .filter((event) => event.transparency !== 'transparent') // marked free
    .map((event) => {
      const from = new Date(event.start!.dateTime!);
      const to = new Date(event.end!.dateTime!);
      return {
        user_id: userId,
        external_id: (event.id ?? '').slice(0, 200),
        day: isoDay,
        start_min: from.getHours() * 60 + from.getMinutes(),
        end_min: to.getHours() * 60 + to.getMinutes(),
        title: (event.summary ?? 'Busy').slice(0, 200),
        is_busy: true,
      };
    });

  if (rows.length) await db.from('calendar_slots').insert(rows);
  return rows.length;
}

// ----------------------------------------------------------------- actions

export async function archiveThread(userId: string, gmailThreadId: string): Promise<boolean> {
  const gmail = await gmailFor(userId);
  try {
    await gmail.users.threads.modify({
      userId: 'me',
      id: gmailThreadId,
      requestBody: { removeLabelIds: ['INBOX'] },
    });
    return true;
  } catch (error) {
    console.warn('[gmail] archive failed:', (error as Error).message);
    return false;
  }
}

export async function trashMessages(userId: string, gmailMessageIds: string[]): Promise<number> {
  if (!gmailMessageIds.length) return 0;
  const gmail = await gmailFor(userId);
  let moved = 0;
  for (const id of gmailMessageIds) {
    try {
      await gmail.users.messages.trash({ userId: 'me', id });
      moved += 1;
    } catch (error) {
      console.warn('[gmail] trash failed:', (error as Error).message);
    }
  }
  return moved;
}
