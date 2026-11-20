/** POST /api/teams/sync — sync my own mailbox now (the schedule does everyone every 15 min). */
import { HttpError, route } from '@/lib/api';
import { adminClient } from '@/lib/supabase';
import { memberFor } from '@/lib/teams/context';
import { syncTeamMailbox } from '@/lib/teams/sync';

export const maxDuration = 60;

export const POST = route(
  async ({ user }) => {
    const me = await memberFor(user.id);
    const { data: mailbox } = await (adminClient() as any)
      .from('mailboxes')
      .select('id')
      .eq('member_id', me.id)
      .neq('sync_status', 'disconnected')
      .maybeSingle();
    if (!mailbox) throw new HttpError(409, 'Connect your mailbox first.');
    return syncTeamMailbox(mailbox.id);
  },
  { limit: { bucket: 'teams-sync', max: 6, windowSeconds: 3600 } },
);
