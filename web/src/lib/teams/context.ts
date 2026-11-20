/**
 * Shared by every Teams route: the feature switch, who the caller is in their
 * org, and the append-only audit log.
 */
import 'server-only';

import { HttpError } from '@/lib/api';
import { env } from '@/lib/env';
import { adminClient } from '@/lib/supabase';

export type Member = { id: string; org_id: string; email: string; name: string; role: 'member' | 'manager' | 'admin' };

/** Teams routes do not exist where TEAMS_ENABLED is off (production today). */
export function requireTeams(): void {
  if (!env().TEAMS_ENABLED) throw new HttpError(404, 'Not found');
}

/** The caller's active membership. The user id comes from the validated session, never the request. */
export async function memberFor(userId: string): Promise<Member> {
  requireTeams();
  const { data } = await (adminClient() as any)
    .from('members')
    .select('id, org_id, email, name, role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!data) throw new HttpError(403, 'You are not a member of a team. Connect your mailbox first.');
  return data as Member;
}

export function requireRole(member: Member, ...roles: Member['role'][]): void {
  if (!roles.includes(member.role)) throw new HttpError(403, 'Your role cannot do that.');
}

export type AuditAction =
  | 'row_viewed'
  | 'row_reassigned'
  | 'draft_created'
  | 'mailbox_connected'
  | 'mailbox_disconnected'
  | 'settings_changed'
  | 'data_deleted';

/** Never put mail content in metadata: ids and field names only. */
export async function audit(
  orgId: string,
  actorMemberId: string | null,
  action: AuditAction,
  target: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await (adminClient() as any)
    .from('audit_events')
    .insert({ org_id: orgId, actor_member_id: actorMemberId, action, target, metadata });
  if (error) console.error('[audit] insert failed:', error.message);
}
