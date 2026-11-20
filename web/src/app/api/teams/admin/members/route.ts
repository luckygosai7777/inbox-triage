/**
 * POST  /api/teams/admin/members — invite someone (admin). They join when they
 *       first connect their mailbox; their email must be on an org domain.
 * PATCH /api/teams/admin/members — change a member's role or remove them (admin).
 */
import { z } from 'zod';

import { HttpError, route } from '@/lib/api';
import { adminClient } from '@/lib/supabase';
import { isInternal } from '@/lib/teams/clients';
import { audit, memberFor, requireRole } from '@/lib/teams/context';

const role = z.enum(['member', 'manager', 'admin']);

export const POST = route(
  async ({ user, db, input }) => {
    const me = await memberFor(user.id);
    requireRole(me, 'admin');
    const { data: org } = await (db as any).from('orgs').select('primary_domain, extra_domains').eq('id', me.org_id).single();
    if (!isInternal(input.email, [org.primary_domain, ...(org.extra_domains ?? [])])) {
      throw new HttpError(400, 'Only addresses on your organisation’s domains can be invited.');
    }
    const { error } = await (db as any)
      .from('members')
      .insert({ org_id: me.org_id, email: input.email, name: input.name, role: input.role });
    if (error) throw new HttpError(409, 'That person is already on the team.');
    await audit(me.org_id, me.id, 'settings_changed', input.email, { invited: true, role: input.role });
    return { ok: true };
  },
  {
    schema: z.object({
      email: z.string().trim().toLowerCase().email(),
      name: z.string().trim().max(120).default(''),
      role: role.default('member'),
    }),
  },
);

export const PATCH = route(
  async ({ user, db, input }) => {
    const me = await memberFor(user.id);
    requireRole(me, 'admin');
    const demoting = (input.role && input.role !== 'admin') || input.status === 'removed';
    if (demoting) {
      // Never leave an org with nobody able to administer it.
      const { data: admins } = await (adminClient() as any)
        .from('members')
        .select('id')
        .eq('org_id', me.org_id)
        .eq('role', 'admin')
        .eq('status', 'active');
      if ((admins ?? []).every((a: any) => a.id === input.id)) throw new HttpError(400, 'The team needs at least one admin.');
    }
    const { id, ...change } = input;
    const { data } = await (db as any).from('members').update(change).eq('id', id).eq('org_id', me.org_id).select('id');
    if (!data?.length) throw new HttpError(404, 'Member not found.');
    await audit(me.org_id, me.id, 'settings_changed', id, change);
    return { ok: true };
  },
  {
    schema: z
      .object({ id: z.string().uuid(), role: role.optional(), status: z.enum(['active', 'removed']).optional() })
      .refine((v) => v.role || v.status, 'Nothing to change'),
  },
);
