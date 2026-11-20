/**
 * GET /api/teams/ledger — the rows I may see, plus the manager rollups.
 *
 * Visibility is decided by Postgres (RLS on ledger_rows), not here: my own
 * rows, rows reassigned to me, and, for managers, rows from mailboxes whose
 * owners opted in. A manager looking at other people's rows is audit-logged.
 */
import { route } from '@/lib/api';
import { audit, memberFor } from '@/lib/teams/context';
import { rollupByClient, rollupByOwner, type TeamRow } from '@/lib/teams/rollup';

const bare = (messageId: string) => messageId.replace(/^<|>$/g, '');

export const GET = route(async ({ user, db }) => {
  const me = await memberFor(user.id);
  const [{ data: rows }, { data: clients }, { data: members }, { data: mailboxes }] = await Promise.all([
    (db as any)
      .from('ledger_rows')
      .select(
        'id, direction, status, owner_member_id, client_id, mailbox_id, summary, source_quote, source_message_id, ' +
          'gmail_thread_id, deadline, deadline_phrase, confidence, created_at',
      )
      .eq('org_id', me.org_id)
      .in('status', ['open', 'done', 'dismissed'])
      .order('created_at', { ascending: false })
      .limit(1000),
    (db as any).from('clients').select('id, display_name').eq('org_id', me.org_id),
    (db as any).from('members').select('id, name, email').eq('org_id', me.org_id),
    (db as any).from('mailboxes').select('id, email, member_id').eq('org_id', me.org_id),
  ]);

  const mailboxById = new Map((mailboxes ?? []).map((m: any) => [m.id, m]));
  const withLinks = (rows ?? []).map((r: any) => {
    const box: any = mailboxById.get(r.mailbox_id);
    // Your own mailbox opens the thread itself; anyone else's copy is found by Message-ID.
    const link =
      box?.member_id === me.id
        ? `https://mail.google.com/mail/u/${encodeURIComponent(box.email)}/#all/${r.gmail_thread_id}`
        : `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(bare(r.source_message_id))}`;
    return { ...r, link, mine: r.owner_member_id === me.id };
  });

  const names = {
    clients: new Map<string, string>((clients ?? []).map((c: any) => [c.id, c.display_name])),
    members: new Map<string, string>((members ?? []).map((m: any) => [m.id, m.name || m.email])),
  };
  const manager = me.role === 'manager' || me.role === 'admin';
  const others = withLinks.filter((r: any) => !r.mine).length;
  if (manager && others) await audit(me.org_id, me.id, 'row_viewed', 'ledger', { rows: others });

  return {
    rows: withLinks,
    byClient: manager ? rollupByClient(withLinks as TeamRow[], names) : [],
    byOwner: manager ? rollupByOwner(withLinks as TeamRow[], names.members) : [],
    clients: Object.fromEntries(names.clients),
    members: Object.fromEntries(names.members),
  };
});
