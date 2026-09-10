/**
 * Pure parsing helpers for Gmail payloads. No network, no database.
 *
 * The deadline extractor is deliberately conservative. A date is asserted only
 * when a real pattern matched; anything vaguer is reported as low confidence so
 * the UI can show the sentence it read instead of inventing a time. The same
 * discipline is reused by the Commitment Ledger — a promise with a fuzzy date
 * is still recorded, it just is not given a deadline it cannot defend.
 */

export type Deadline = {
  dueAt: Date | null;
  text: string;
  evidence: string;
  confidence: 'high' | 'low';
  matched: boolean;
};

// ------------------------------------------------------------------ headers

export type Headers = Record<string, string>;

export function headerMap(payload: any): Headers {
  const list: Array<{ name?: string; value?: string }> = payload?.headers ?? [];
  const out: Headers = {};
  for (const header of list) {
    if (header?.name) out[header.name.toLowerCase()] = header.value ?? '';
  }
  return out;
}

/** `"Maya Okonkwo <maya@x.co>"` → `{ name, email }`. */
export function splitAddress(raw: string): { name: string; email: string } {
  const value = (raw ?? '').trim();
  const angled = value.match(/^(.*?)<([^>]+)>\s*$/);
  let name = '';
  let email = '';

  if (angled) {
    name = angled[1].trim().replace(/^["']|["']$/g, '');
    email = angled[2].trim().toLowerCase();
  } else {
    email = value.replace(/^<|>$/g, '').trim().toLowerCase();
  }

  if (!email.includes('@')) return { name: name || value, email: '' };
  if (!name) {
    name = email
      .split('@')[0]
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
  return { name, email };
}

export function splitAddressList(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((chunk) => splitAddress(chunk).email)
    .filter(Boolean);
}

export function parseDate(raw: string, fallbackMs?: string | number | null): Date {
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (fallbackMs != null) {
    const ms = Number(fallbackMs);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  return new Date();
}

// ------------------------------------------------------------------- bodies

function decodeBase64Url(data: string): string {
  if (!data) return '';
  try {
    return Buffer.from(data, 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function* walkParts(payload: any): Generator<any> {
  if (!payload) return;
  const stack = [payload];
  while (stack.length) {
    const part = stack.pop();
    yield part;
    const children = part?.parts ?? [];
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
}

/** Best-effort plain text. Prefers text/plain, falls back to stripped HTML. */
export function extractBodyText(payload: any, limit = 4000): string {
  let plain = '';
  let html = '';
  for (const part of walkParts(payload)) {
    const data = part?.body?.data;
    if (!data) continue;
    if (part.mimeType === 'text/plain' && !plain) plain = decodeBase64Url(data);
    else if (part.mimeType === 'text/html' && !html) html = decodeBase64Url(data);
  }
  const text = plain || html.replace(/<[^>]+>/g, ' ');
  return text
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit);
}

export function hasAttachment(payload: any): boolean {
  for (const part of walkParts(payload)) {
    if (part?.filename && part?.body?.attachmentId) return true;
  }
  return false;
}

export function makePreview(snippet: string, body: string, limit = 220): string {
  const text = (snippet || '').trim() || (body || '');
  return text.replace(/\s+/g, ' ').trim().slice(0, limit);
}

/**
 * Strips quoted history and signatures.
 *
 * Matters for the Commitment Ledger: without it, every reply appears to repeat
 * the promises quoted from earlier messages in the thread.
 */
export function stripQuoted(body: string): string {
  const lines = (body ?? '').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^>+/.test(trimmed)) break;
    if (/^On .+ (wrote|escreveu):/i.test(trimmed)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(trimmed)) break;
    if (/^From:\s.+@/i.test(trimmed) && kept.length > 0) break;
    if (/^--\s*$/.test(trimmed)) break; // signature delimiter
    kept.push(line);
  }
  return kept.join('\n').trim();
}

// ---------------------------------------------------------------- deadlines

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

const WEEKDAY_NAMES = Object.keys(WEEKDAYS).join('|');

type Rule = { kind: 'todayAt' | 'today' | 'tomorrow' | 'weekday'; re: RegExp };

// Ordered most specific first; the first match wins.
const RULES: Rule[] = [
  { kind: 'todayAt', re: new RegExp(`\\bby\\s+(?<hour>\\d{1,2})(?::(?<minute>\\d{2}))?\\s*(?<ampm>am|pm)?\\s+today\\b`, 'i') },
  { kind: 'todayAt', re: new RegExp(`\\btoday\\b[^.\\n]{0,20}?\\bby\\s+(?<hour>\\d{1,2})(?::(?<minute>\\d{2}))?\\s*(?<ampm>am|pm)?`, 'i') },
  { kind: 'todayAt', re: new RegExp(`\\bbefore\\s+(?<hour>\\d{1,2})(?::(?<minute>\\d{2}))?\\s*(?<ampm>am|pm)?\\s+today\\b`, 'i') },
  { kind: 'weekday', re: new RegExp(`\\bby\\s+(?<weekday>${WEEKDAY_NAMES})\\b`, 'i') },
  { kind: 'weekday', re: new RegExp(`\\bneed\\s+(?:an\\s+)?answer\\s+by\\s+(?<weekday>${WEEKDAY_NAMES})\\b`, 'i') },
  { kind: 'weekday', re: new RegExp(`\\b(?:send|get|have)\\s+.{0,40}?\\bto\\s+you\\s+by\\s+(?<weekday>${WEEKDAY_NAMES})\\b`, 'i') },
  { kind: 'tomorrow', re: /\bby\s+tomorrow\b/i },
  { kind: 'today', re: /\b(?:by\s+)?end\s+of\s+(?:the\s+)?day\b|\beod\b/i },
  { kind: 'today', re: /\bby\s+today\b|\btoday\b[^.\n]{0,24}\bdeadline\b/i },
];

export function sentences(text: string): string[] {
  return (text ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveHour(groups: Record<string, string | undefined>): number | null {
  if (groups.hour === undefined) return null;
  let hour = Number(groups.hour);
  const ampm = (groups.ampm ?? '').toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  else if (ampm === 'am' && hour === 12) hour = 0;
  return hour >= 0 && hour <= 23 ? hour : null;
}

function at(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Finds an explicit deadline. `matched: false` means none was stated. */
export function extractDeadline(text: string, now: Date = new Date()): Deadline {
  for (const sentence of sentences(text)) {
    for (const rule of RULES) {
      const match = sentence.match(rule.re);
      if (!match) continue;
      const groups = (match.groups ?? {}) as Record<string, string | undefined>;

      let dueAt: Date;
      let label: string;

      if (rule.kind === 'todayAt') {
        const hour = resolveHour(groups);
        if (hour === null) continue;
        const minute = Number(groups.minute ?? 0);
        dueAt = at(now, 0, hour, minute);
        label = `Today, ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      } else if (rule.kind === 'today') {
        dueAt = at(now, 0, 18);
        label = 'Today, 18:00';
      } else if (rule.kind === 'tomorrow') {
        dueAt = at(now, 1, 18);
        label = 'Tomorrow, 18:00';
      } else {
        const target = WEEKDAYS[(groups.weekday ?? '').toLowerCase()];
        if (target === undefined) continue;
        const ahead = (target - now.getDay() + 7) % 7 || 7;
        dueAt = at(now, ahead, 18);
        const name = (groups.weekday ?? '').toLowerCase();
        label = `${name.charAt(0).toUpperCase()}${name.slice(1)}, 18:00`;
      }

      return {
        dueAt,
        text: label,
        evidence: sentence.slice(0, 300),
        confidence: 'high',
        matched: true,
      };
    }
  }
  return { dueAt: null, text: '', evidence: '', confidence: 'low', matched: false };
}

// ----------------------------------------------------- List-Unsubscribe

export function parseListUnsubscribe(raw: string): { mailto?: string; url?: string } {
  const out: { mailto?: string; url?: string } = {};
  if (!raw) return out;
  const mailto = raw.match(/<mailto:([^>?]+)/i);
  if (mailto) out.mailto = mailto[1].trim();
  const http = raw.match(/<(https?:\/\/[^>]+)>/i);
  if (http) out.url = http[1].trim();
  return out;
}

export function looksLikeListMail(headers: Headers): boolean {
  const markers = ['list-unsubscribe', 'list-id', 'x-campaign-id'];
  if (markers.some((m) => m in headers)) return true;
  return ['bulk', 'list', 'junk'].includes((headers.precedence ?? '').toLowerCase());
}

// ------------------------------------------------------------ sender kind

/**
 * Who sent this: a machine, a mailing list, or a person?
 *
 * This exists because the first classifier treated "Clients" as the catch-all
 * category — anything that was not a newsletter, receipt or social notification
 * fell into it. A Google security alert became a client. That is worse than
 * useless: it puts machine noise in the one category that is supposed to mean
 * "a human I do business with".
 *
 * Detection is header-first because headers are what senders actually use to
 * declare themselves, and they are far harder to get wrong than reading prose.
 */
export type SenderKind = 'automated' | 'list' | 'person';

/**
 * Local parts that only ever belong to a machine. Deliberately excludes
 * support@, info@, hello@, contact@ and sales@ — those are usually staffed by
 * a person who does expect a reply.
 */
const AUTOMATED_LOCAL =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|notifications?|notify|alerts?|automated|auto[-_.]?(reply|mailer|confirm)|mailer([-_.]?daemon)?|bounce[sd]?|postmaster|system|robot|bot|noc|cron|daemon|nepasrepondre)([-_.+].*)?$/i;

/** Phrases that appear in the body of machine-sent mail. */
const AUTOMATED_BODY =
  /\b(do not reply to this (e-?mail|message)|this is an automated|automatically generated|please do not respond to this)\b/i;

export function senderKind(
  headers: Headers,
  fromEmail: string,
  body = '',
): SenderKind {
  // 1. RFC 3834: the sender explicitly declared itself automatic.
  const autoSubmitted = (headers['auto-submitted'] ?? '').toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return 'automated';

  // 2. Headers only bulk tooling sets.
  if ('x-auto-response-suppress' in headers) return 'automated';
  if ('feedback-id' in headers) return 'automated';
  if (['auto_reply', 'auto-reply'].includes((headers.precedence ?? '').toLowerCase())) {
    return 'automated';
  }

  // 3. The address itself.
  const local = (fromEmail.split('@')[0] ?? '').trim();
  if (AUTOMATED_LOCAL.test(local)) return 'automated';

  // 4. A list is a machine too, but a distinguishable one — a newsletter is
  //    worth separating from a password-reset notice.
  if (looksLikeListMail(headers)) return 'list';

  // 5. Last resort: the body says so.
  if (AUTOMATED_BODY.test(body.slice(0, 2000))) return 'automated';

  return 'person';
}
