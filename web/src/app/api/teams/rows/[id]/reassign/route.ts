/**
 * POST /api/teams/rows/:id/reassign — hand a row to a colleague.
 * Allowed for the row's owner, or a manager/admin. Every hand-off is recorded
 * (row_assignments + audit), which is the groundwork for leave/handover.
 */
import { z } from 'zod';

import { HttpError, route } from '@/lib/api';
import { adminClient } from '@/lib/supabase';
import { audit, memberFor } from '@/lib/teams/context';

const schema = z.object({ to: z.string().uuid(), reason: z.string().trim().max(300).default('') });

export const POST = route(
  async ({ user, input, params }) => {
    const me = await memberFor(user.id);
    const db = adminClient() as any;
    const { data: row } = await db
      .from('ledger_rows')
      .select('id, org_id, owner_member_id')
      .eq('id', params.id)
      .eq('org_id', me.org_id)
      .maybeSingle();
    if (!row) throw new HttpError(404, 'Row not found.');
    if (row.owner_member_id !== me.id && me.role === 'member') throw new HttpError(403, 'Only the owner or a manager can reassign this.');

    const { data: target } = await db
      .from('members')
      .select('id')
      .eq('id', input.to)
      .eq('org_id', me.org_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!target) throw new HttpError(400, 'That person is not an active member of your team.');

    await db.from('ledger_rows').update({ owner_member_id: target.id, status: 'open' }).eq('id', row.id);
    await db.from('row_assignments').insert({
      row_id: row.id,
      from_member: row.owner_member_id,
      to_member: target.id,
      by_member: me.id,
      reason: input.reason,
    });
    await audit(me.org_id, me.id, 'row_reassigned', row.id, { from: row.owner_member_id, to: target.id });
    return { ok: true };
  },
  { schema, limit: { bucket: 'teams-reassign', max: 120, windowSeconds: 3600 } },
);
