/**
 * GET   /api/teams/admin — members, mailboxes and the recent audit log (admin).
 * PATCH /api/teams/admin — org name, extra domains and settings (admin).
 *
 * Reads and writes go through the admin's own session, so RLS and the column
 * grants in 003_teams.sql enforce this, not just the role check here.
 */
import { z } from 'zod';

import { route } from '@/lib/api';
import { audit, memberFor, requireRole } from '@/lib/teams/context';

export const GET = route(async ({ user, db }) => {
  const me = await memberFor(user.id);
  requireRole(me, 'admin');
  const [{ data: members }, { data: mailboxes }, { data: events }] = await Promise.all([
    (db as any).from('members').select('id, email, name, role, status, created_at').eq('org_id', me.org_id).order('created_at'),
    (db as any)
      .from('mailboxes')
      .select('id, member_id, email, sync_status, sync_error, last_synced_at, visible_to_managers')
      .eq('org_id', me.org_id),
    (db as any)
      .from('audit_events')
      .select('id, actor_member_id, action, target, at, metadata')
      .eq('org_id', me.org_id)
      .order('at', { ascending: false })
      .limit(200),
  ]);
  return { members, mailboxes, events };
});

const domain = z.string().trim().toLowerCase().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Not a domain');
const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  extra_domains: z.array(domain).max(20).optional(),
  settings: z
    .object({
      reply_hours: z.number().int().min(1).max(720),
      business_hours: z.tuple([z.number().int().min(0).max(23), z.number().int().min(1).max(24)]),
      timezone: z.string().min(1).max(64),
      backfill_days: z.number().int().min(1).max(180),
    })
    .optional(),
});

export const PATCH = route(
  async ({ user, db, input }) => {
    const me = await memberFor(user.id);
    requireRole(me, 'admin');
    await (db as any).from('orgs').update(input).eq('id', me.org_id);
    await audit(me.org_id, me.id, 'settings_changed', 'org', { fields: Object.keys(input) });
    return { ok: true };
  },
  { schema },
);
