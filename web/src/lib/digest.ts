/**
 * The daily digest.
 *
 * This is what turns the product from a tool you visit into a service that
 * tells you. The whole premise is "you forgot something" — which is useless if
 * finding out depends on you remembering to check.
 *
 * Composition is pure and separate from sending so it can be tested without a
 * mail provider, and so the same content can render as HTML or plain text.
 *
 * Editorial rule: send nothing when there is nothing to say. A digest that
 * arrives every morning saying "you're all clear" trains people to filter it,
 * and then the one that matters is filtered too.
 */
import { statusOf, type Direction } from './commitments';

export type DigestRow = {
  what: string;
  counterparty: string;
  direction: Direction;
  dueAt: string | null;
  createdAt: string;
};

export type Digest = {
  send: boolean;
  reason: string;
  subject: string;
  heading: string;
  overdue: DigestRow[];
  today: DigestRow[];
  stale: DigestRow[];
  totalOpen: number;
};

/** Anything undated and older than this is nagging quietly in the background. */
const STALE_DAYS = 10;

function ageDays(row: DigestRow, now: Date): number {
  return Math.floor((now.getTime() - new Date(row.createdAt).getTime()) / 86_400_000);
}

export function composeDigest(rows: DigestRow[], now = new Date()): Digest {
  const overdue = rows.filter((row) => statusOf(row, now) === 'overdue');
  const today = rows.filter((row) => statusOf(row, now) === 'today');
  const stale = rows
    .filter((row) => statusOf(row, now) === 'undated' && ageDays(row, now) >= STALE_DAYS)
    .sort((a, b) => ageDays(b, now) - ageDays(a, now))
    .slice(0, 3);

  const worthSending = overdue.length > 0 || today.length > 0 || stale.length > 0;

  // The subject line is the product. Most people will only ever read this.
  let subject: string;
  let heading: string;
  if (overdue.length) {
    const first = overdue[0];
    subject =
      overdue.length === 1
        ? `Late: ${first.what} (${first.counterparty})`
        : `${overdue.length} things are late, oldest is ${first.counterparty}`;
    heading = `${overdue.length} ${overdue.length === 1 ? 'thing is' : 'things are'} late`;
  } else if (today.length) {
    subject = `Due today: ${today.length} ${today.length === 1 ? 'thing' : 'things'}`;
    heading = `${today.length} due today`;
  } else if (stale.length) {
    subject = `${stale.length} ${stale.length === 1 ? 'promise has' : 'promises have'} been sitting a while`;
    heading = 'Nothing late, but these have been waiting';
  } else {
    subject = '';
    heading = '';
  }

  return {
    send: worthSending,
    reason: worthSending ? 'has content' : 'nothing due, late or stale',
    subject,
    heading,
    overdue: overdue.slice(0, 10),
    today: today.slice(0, 10),
    stale,
    totalOpen: rows.length,
  };
}

function describe(row: DigestRow, now: Date): string {
  const who = row.counterparty || 'someone';
  const lead = row.direction === 'owed' ? `You told ${who} you would` : `${who} asked you to`;
  const late =
    row.dueAt && statusOf(row, now) === 'overdue'
      ? ` — ${Math.max(1, Math.round((now.getTime() - new Date(row.dueAt).getTime()) / 86_400_000))} days late`
      : '';
  return `${lead}${late}`;
}

export function renderDigestText(digest: Digest, appUrl: string, now = new Date()): string {
  const lines: string[] = [digest.heading, ''];

  const block = (title: string, rows: DigestRow[]) => {
    if (!rows.length) return;
    lines.push(title.toUpperCase(), '');
    for (const row of rows) {
      lines.push(`  • ${row.what}`);
      lines.push(`    ${describe(row, now)}`);
    }
    lines.push('');
  };

  block('Late', digest.overdue);
  block('Due today', digest.today);
  block('Been waiting a while', digest.stale);

  lines.push(`See the full list: ${appUrl}/app/ledger`);
  lines.push('');
  lines.push(`Turn this off: ${appUrl}/app/settings`);
  return lines.join('\n');
}

/** Inline styles only — email clients strip stylesheets. */
export function renderDigestHtml(digest: Digest, appUrl: string, now = new Date()): string {
  const esc = (value: string) =>
    value.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );

  const block = (title: string, rows: DigestRow[], color: string) => {
    if (!rows.length) return '';
    const items = rows
      .map(
        (row) => `
      <tr><td style="padding:12px 0;border-bottom:1px solid #efeae1;">
        <div style="font:600 15px/1.4 -apple-system,Segoe UI,sans-serif;color:#1a1714;">${esc(row.what)}</div>
        <div style="font:400 13px/1.5 -apple-system,Segoe UI,sans-serif;color:#635c54;margin-top:4px;">${esc(describe(row, now))}</div>
      </td></tr>`,
      )
      .join('');
    return `
    <tr><td style="padding-top:24px;">
      <div style="font:600 11px/1 -apple-system,Segoe UI,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${color};">${esc(title)}</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${items}</table>
    </td></tr>`;
  };

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf8f4;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
<tr><td align="center">
<table width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e9e3d9;border-radius:12px;padding:24px;" cellpadding="0" cellspacing="0" role="presentation">
  <tr><td>
    <div style="font:700 13px/1 -apple-system,Segoe UI,sans-serif;color:#b4441e;">OWED</div>
    <div style="font:600 22px/1.25 -apple-system,Segoe UI,sans-serif;color:#1a1714;margin-top:10px;">${esc(digest.heading)}</div>
    <div style="font:400 13px/1.5 -apple-system,Segoe UI,sans-serif;color:#8a8178;margin-top:6px;">${digest.totalOpen} open in total</div>
  </td></tr>
  ${block('Late', digest.overdue, '#9f1239')}
  ${block('Due today', digest.today, '#a16207')}
  ${block('Been waiting a while', digest.stale, '#8a8178')}
  <tr><td style="padding-top:28px;">
    <a href="${appUrl}/app/ledger" style="display:inline-block;background:#b4441e;color:#ffffff;font:600 14px/1 -apple-system,Segoe UI,sans-serif;padding:12px 20px;border-radius:8px;text-decoration:none;">See the full list</a>
  </td></tr>
  <tr><td style="padding-top:24px;border-top:1px solid #e9e3d9;margin-top:24px;">
    <div style="font:400 12px/1.5 -apple-system,Segoe UI,sans-serif;color:#8a8178;">
      You get this because daily digests are on.
      <a href="${appUrl}/app/settings" style="color:#b4441e;">Turn them off</a>.
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Is it the user's digest hour in their own timezone, and have they not already
 * had one today? The cron runs hourly and this decides who is due.
 */
export function digestIsDue(
  profile: { timezone: string; digest_hour: number; last_digest_at: string | null },
  now = new Date(),
): boolean {
  let localHour: number;
  try {
    localHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: profile.timezone || 'UTC',
        hour: 'numeric',
        hour12: false,
      }).format(now),
    );
  } catch {
    localHour = now.getUTCHours(); // unknown timezone: fall back rather than skip
  }

  if (localHour !== profile.digest_hour) return false;
  if (!profile.last_digest_at) return true;

  // Guard against a second send inside the same hour if the cron double-fires.
  return now.getTime() - new Date(profile.last_digest_at).getTime() > 20 * 3600_000;
}
