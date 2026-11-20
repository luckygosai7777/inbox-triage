/**
 * PATCH  /api/teams/mailboxes/:id — the owner's manager-visibility opt-in (RLS: owner only).
 * DELETE /api/teams/mailboxes/:id — disconnect: revoke Google access and delete
 *        everything we hold from this mailbox. Owner or admin. Both logged.
 */
import { z } from 'zod';

import { HttpError, route } from '@/lib/api';
import { adminClient } from '@/lib/supabase';
import { audit, memberFor } from '@/lib/teams/context';
import { teamAuth } from '@/lib/teams/sync';

export const PATCH = route(
  async ({ user, db, input, params }) => {
    const me = await memberFor(user.id);
    const { data } = await (db as any)
      .from('mailboxes')
      .update({ visible_to_managers: input.visible_to_managers })
      .eq('id', params.id)
      .select('id');
    if (!data?.length) throw new HttpError(404, 'Mailbox not found, or not yours.');
    await audit(me.org_id, me.id, 'settings_changed', params.id, { visible_to_managers: input.visible_to_managers });
    return { ok: true };
  },
  { schema: z.object({ visible_to_managers: z.boolean() }) },
);

export const DELETE = route(async ({ user, params }) => {
  const me = await memberFor(user.id);
  const db = adminClient() as any;
  const { data: mailbox } = await db
    .from('mailboxes')
    .select('id, member_id, email')
    .eq('id', params.id)
    .eq('org_id', me.org_id)
    .maybeSingle();
  if (!mailbox) throw new HttpError(404, 'Mailbox not found.');
  if (mailbox.member_id !== me.id && me.role !== 'admin') throw new HttpError(403, 'Only its owner or an admin can disconnect it.');

  try {
    const auth = await teamAuth(mailbox.id);
    const token = auth.credentials.refresh_token;
    if (token) await auth.revokeToken(token);
  } catch (error) {
    // Already revoked at Google, or no token: deleting our copy still goes ahead.
    console.warn('[teams] revoke failed:', (error as Error).message);
  }
  // Cascades: token, ledger rows, thread metadata from this mailbox.
  await db.from('mailboxes').delete().eq('id', mailbox.id);
  await audit(me.org_id, me.id, 'mailbox_disconnected', mailbox.email);
  await audit(me.org_id, me.id, 'data_deleted', mailbox.email, { scope: 'mailbox' });
  return { ok: true };
});
