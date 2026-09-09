/**
 * Daily digest.
 *
 * Runs hourly and emails whoever's chosen hour has just arrived in their own
 * timezone. Hourly rather than daily because "8am" means different moments to
 * different people, and a digest that lands at 3am is a digest that gets muted.
 *
 * Sends nothing when there is nothing to say. A mail that arrives every morning
 * reading "you're all clear" teaches people to filter it — and then the one that
 * mattered is filtered too.
 */
import { NextResponse, type NextRequest } from 'next/server';

import {
  composeDigest,
  digestIsDue,
  renderDigestHtml,
  renderDigestText,
  type DigestRow,
} from '@/lib/digest';
import { cronForbidden } from '@/lib/cron';
import { emailConfigured, sendEmail } from '@/lib/email';
import { adminClient } from '@/lib/supabase';

const BATCH = 50;

export async function GET(request: NextRequest) {
  const forbidden = cronForbidden(request);
  if (forbidden) return forbidden;

  if (!emailConfigured()) {
    return NextResponse.json({
      skipped: 'email not configured',
      hint: 'Set RESEND_API_KEY and EMAIL_FROM to enable digests.',
    });
  }

  let db: ReturnType<typeof adminClient>;
  try {
    db = adminClient();
  } catch (caught) {
    return NextResponse.json(
      { skipped: 'database not configured', hint: (caught as Error).message },
      { status: 503 },
    );
  }

  const now = new Date();
  const appUrl = process.env.APP_URL ?? '';

  const { data: profiles, error } = await db
    .from('profiles')
    .select('id, email, timezone, digest_hour, last_digest_at')
    .eq('digest_enabled', true)
    .limit(500);

  if (error) {
    console.error('[cron/digest] could not list profiles:', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const dueNow = (profiles ?? []).filter((profile: any) => digestIsDue(profile, now)).slice(0, BATCH);

  let sent = 0;
  let empty = 0;
  let failed = 0;

  for (const profile of dueNow as any[]) {
    try {
      const { data: rows } = await db
        .from('commitments')
        .select('what, counterparty, direction, due_at, created_at')
        .eq('user_id', profile.id)
        .eq('status', 'open');

      const ledger: DigestRow[] = (rows ?? []).map((row: any) => ({
        what: row.what,
        counterparty: row.counterparty,
        direction: row.direction,
        dueAt: row.due_at,
        createdAt: row.created_at,
      }));

      const digest = composeDigest(ledger, now);

      // Stamp the send attempt either way, so a quiet day does not queue up a
      // burst of digests the moment something finally becomes due.
      await db.from('profiles').update({ last_digest_at: now.toISOString() }).eq('id', profile.id);

      if (!digest.send) {
        empty += 1;
        continue;
      }

      const result = await sendEmail({
        to: profile.email,
        subject: digest.subject,
        html: renderDigestHtml(digest, appUrl, now),
        text: renderDigestText(digest, appUrl, now),
      });
      if (result.sent) sent += 1;
      else failed += 1;
    } catch (caught) {
      failed += 1;
      console.error(`[cron/digest] ${profile.id} failed:`, (caught as Error).message);
    }
  }

  return NextResponse.json({ considered: dueNow.length, sent, empty, failed });
}

export const maxDuration = 60;
