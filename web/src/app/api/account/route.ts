/**
 * Account management.
 *
 * GET    — connection status and how much data we hold
 * DELETE — remove everything and revoke Google access
 *
 * Deletion is real: rows are removed immediately, and we ask Google to revoke
 * the refresh token so our access ends even before the rows are gone. A privacy
 * policy that promises deletion has to be backed by code that does it.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route, HttpError } from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { isDemo } from '@/lib/demo';
import { env } from '@/lib/env';
import { adminClient } from '@/lib/supabase';

const OWNED_TABLES = [
  'commitments',
  'slot_assignments',
  'campaign_log',
  'campaign_recipients',
  'campaign_documents',
  'campaigns',
  'calendar_slots',
  'vip_senders',
  'subscriptions',
  'messages',
  'threads',
  'rate_limits',
] as const;

export const GET = route(async ({ user }) => {
  if (isDemo()) {
    return {
      email: user.email,
      googleConnected: false,
      lastSyncedAt: null,
      counts: { messages: 10, commitments: 7, subscriptions: 0 },
      demo: true,
    };
  }

  const db = adminClient();
  const [profile, messages, commitments, subscriptions] = await Promise.all([
    db.from('profiles').select('last_synced_at, google_refresh_token_enc').eq('id', user.id).maybeSingle(),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    db.from('commitments').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ]);

  return {
    email: user.email,
    googleConnected: Boolean((profile.data as any)?.google_refresh_token_enc),
    lastSyncedAt: (profile.data as any)?.last_synced_at ?? null,
    counts: {
      messages: messages.count ?? 0,
      commitments: commitments.count ?? 0,
      subscriptions: subscriptions.count ?? 0,
    },
  };
});

const deleteSchema = z.object({
  // Typing the phrase is the confirmation; a modal alone is too easy to click.
  confirm: z.literal('DELETE'),
});

export const DELETE = route<z.infer<typeof deleteSchema>>(
  async ({ user, input }) => {
    if (input.confirm !== 'DELETE') {
      throw new HttpError(400, 'Type DELETE to confirm');
    }
    if (isDemo()) {
      return { deleted: true, demo: true };
    }

    const db = adminClient();

    // Revoke at Google first. If this fails we still delete our copy, but the
    // user is told so they can revoke manually.
    let revoked = false;
    try {
      const { data } = await db
        .from('profiles')
        .select('google_refresh_token_enc')
        .eq('id', user.id)
        .maybeSingle();
      const encrypted = (data as any)?.google_refresh_token_enc;
      if (encrypted) {
        const token = decryptSecret(encrypted);
        const response = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }),
        });
        revoked = response.ok;
      } else {
        revoked = true; // nothing to revoke
      }
    } catch (error) {
      console.error('[account] google revoke failed:', error);
    }

    for (const table of OWNED_TABLES) {
      const { error } = await db.from(table).delete().eq('user_id', user.id);
      if (error) console.error(`[account] delete ${table}:`, error.message);
    }
    await db.from('profiles').delete().eq('id', user.id);

    // Removing the auth user invalidates every session immediately.
    try {
      await db.auth.admin.deleteUser(user.id);
    } catch (error) {
      console.error('[account] auth user delete failed:', error);
    }

    return NextResponse.json({ deleted: true, googleRevoked: revoked });
  },
  { schema: deleteSchema },
);
