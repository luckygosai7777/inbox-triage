/**
 * Shared guard for scheduled endpoints.
 *
 * Cron routes cannot use session auth — nobody is signed in when they fire — so
 * they are protected by a shared secret instead. Two things matter:
 *
 *  1. The comparison is constant-time, so the secret cannot be recovered by
 *     timing repeated guesses.
 *  2. If CRON_SECRET is unset, the route refuses rather than running open. A
 *     misconfigured deploy should break loudly, not quietly expose a job that
 *     spends money.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when the
 * variable is set on the project.
 */
import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { safeEqual } from './crypto';

export function cronForbidden(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET is not set — refusing to run');
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
