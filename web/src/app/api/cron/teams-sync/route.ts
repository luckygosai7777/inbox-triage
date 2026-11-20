/**
 * Scheduled Teams sync, called every 15 minutes by GitHub Actions
 * (.github/workflows/teams-sync.yml) with the same bearer secret as the other
 * crons. Takes the stalest mailboxes first and stops before the 60s limit;
 * each mailbox's own lock stops two runs syncing it at once.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { cronForbidden } from '@/lib/cron';
import { env } from '@/lib/env';
import { adminClient } from '@/lib/supabase';
import { syncTeamMailbox } from '@/lib/teams/sync';

export const maxDuration = 60;
const BUDGET_MS = 50_000;

export async function GET(request: NextRequest) {
  const forbidden = cronForbidden(request);
  if (forbidden) return forbidden;
  if (!env().TEAMS_ENABLED) return NextResponse.json({ skipped: 'teams disabled' }, { status: 404 });

  const started = Date.now();
  const { data: mailboxes } = await (adminClient() as any)
    .from('mailboxes')
    .select('id')
    .neq('sync_status', 'disconnected')
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(10);

  const results: Record<string, unknown> = {};
  for (const { id } of mailboxes ?? []) {
    const left = BUDGET_MS - (Date.now() - started);
    if (left < 8_000) break;
    results[id] = await syncTeamMailbox(id, left - 5_000);
  }
  return NextResponse.json({ synced: Object.keys(results).length, results });
}
