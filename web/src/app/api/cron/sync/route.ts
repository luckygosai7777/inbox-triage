/**
 * Scheduled background sync.
 *
 * Runs hourly and refreshes the accounts that have gone longest without a sync.
 * This is what makes the product active: without it, the app only knows what
 * you owe at the moment you happen to open it, which defeats the point of a
 * tool whose job is to remember for you.
 *
 * Batched deliberately. A serverless function has ~60 seconds, and one sync can
 * take several, so it takes a small slice per run rather than trying to do
 * everyone and timing out halfway with no record of where it stopped. At hourly
 * cadence the queue drains continuously.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { cronForbidden } from '@/lib/cron';
import { GoogleNotConnected, syncCalendar, syncMailbox } from '@/lib/gmail';
import { adminClient } from '@/lib/supabase';

/** How many accounts one invocation will attempt. */
const BATCH = 5;
/** Do not re-sync an account touched more recently than this. */
const MIN_INTERVAL_MINUTES = 45;
/** Give up on an account after this many consecutive failures. */
const MAX_FAILURES = 5;

export async function GET(request: NextRequest) {
  const forbidden = cronForbidden(request);
  if (forbidden) return forbidden;

  // Fail with a readable message rather than a stack trace when the project
  // is not fully configured (local demo, or a half-finished deploy).
  let db: ReturnType<typeof adminClient>;
  try {
    db = adminClient();
  } catch (caught) {
    return NextResponse.json(
      { skipped: 'database not configured', hint: (caught as Error).message },
      { status: 503 },
    );
  }

  const cutoff = new Date(Date.now() - MIN_INTERVAL_MINUTES * 60_000).toISOString();

  const { data: due, error } = await db
    .from('profiles')
    .select('id, email, last_synced_at, sync_failures')
    .eq('sync_enabled', true)
    .not('google_refresh_token_enc', 'is', null)
    .lt('sync_failures', MAX_FAILURES)
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    // Nulls first: an account that has never synced is the most urgent.
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(BATCH);

  if (error) {
    console.error('[cron/sync] could not list accounts:', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const profile of (due ?? []) as any[]) {
    try {
      const result = await syncMailbox(profile.id);
      try {
        await syncCalendar(profile.id);
      } catch {
        // Calendar is optional; mail sync already succeeded.
      }
      await db.from('profiles').update({ sync_failures: 0 }).eq('id', profile.id);
      results.push({
        user: profile.id,
        ok: true,
        fetched: result.fetched,
        commitments: result.commitments,
      });
    } catch (caught) {
      const failures = Number(profile.sync_failures ?? 0) + 1;
      // Disconnected accounts stop being retried every hour forever. The user
      // sees "not connected" in Settings and can reconnect.
      const disconnected = caught instanceof GoogleNotConnected;
      await db
        .from('profiles')
        .update({
          sync_failures: failures,
          ...(disconnected || failures >= MAX_FAILURES ? { sync_enabled: false } : {}),
        })
        .eq('id', profile.id);

      console.error(`[cron/sync] ${profile.id} failed (${failures}):`, (caught as Error).message);
      results.push({ user: profile.id, ok: false, failures, disconnected });
    }
  }

  return NextResponse.json({ attempted: results.length, results });
}

export const maxDuration = 60;
