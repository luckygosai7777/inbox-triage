/**
 * GET /api/export — download everything we hold, as JSON.
 *
 * The privacy policy promises access and portability; this is the mechanism.
 * Served as an attachment so a browser saves it rather than rendering it.
 */
import { NextResponse } from 'next/server';

import { route } from '@/lib/api';
import { demoCommitments, demoMail, isDemo } from '@/lib/demo';
import { adminClient } from '@/lib/supabase';

const TABLES = [
  'threads',
  'messages',
  'commitments',
  'subscriptions',
  'vip_senders',
  'calendar_slots',
  'slot_assignments',
  'campaigns',
  'campaign_recipients',
  'campaign_documents',
  'campaign_log',
] as const;

export const GET = route(
  async ({ user }) => {
    const payload: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email },
    };

    if (isDemo()) {
      payload.messages = demoMail();
      payload.commitments = demoCommitments();
      payload.note = 'Demo data — not a real export.';
    } else {
      const db = adminClient();
      for (const table of TABLES) {
        const { data, error } = await db.from(table).select('*').eq('user_id', user.id);
        payload[table] = error ? { error: error.message } : (data ?? []);
      }
      // The encrypted Google token is deliberately excluded: exporting it would
      // hand a copy of mailbox access to whatever reads the downloaded file.
    }

    const filename = `inbox-triage-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  },
  { limit: { bucket: 'export', max: 5, windowSeconds: 3600 } },
);
