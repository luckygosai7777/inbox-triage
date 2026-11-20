/** GET /api/teams/me — who I am in my org, my mailbox, and how much of the team is connected. */
import { route } from '@/lib/api';
import { memberFor } from '@/lib/teams/context';

export const GET = route(async ({ user, db }) => {
  const me = await memberFor(user.id);
  const [{ data: org }, { data: mailboxes }, { data: members }] = await Promise.all([
    (db as any).from('orgs').select('id, name, primary_domain, extra_domains, settings').eq('id', me.org_id).single(),
    (db as any)
      .from('mailboxes')
      .select('id, member_id, email, sync_status, sync_error, last_synced_at, visible_to_managers')
      .eq('org_id', me.org_id),
    (db as any).from('members').select('id, status').eq('org_id', me.org_id),
  ]);
  const connected = (mailboxes ?? []).filter((m: any) => m.sync_status !== 'disconnected');
  return {
    member: me,
    org,
    myMailbox: connected.find((m: any) => m.member_id === me.id) ?? null,
    // "Based on 5 of 8 team mailboxes": a reply from an unconnected mailbox is invisible to us.
    coverage: {
      connected: connected.length,
      members: (members ?? []).filter((m: any) => m.status !== 'removed').length,
      visibleToManagers: connected.filter((m: any) => m.visible_to_managers).length,
    },
  };
});
