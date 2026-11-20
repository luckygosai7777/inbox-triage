/**
 * The manager's two views, computed from rows the caller is already allowed
 * to see (RLS decides that, not this file):
 *
 *   per client: "Acme: we owe 3 (Ravi 2, Priya 1, oldest 6 days late)
 *                · they owe us 1 · 2 unanswered asks"
 *   per owner:  open count, overdue count, oldest lateness
 *
 * Lateness uses the personal Ledger's own ordering (sortLedger), so a row sorts
 * the same way for a member and for their manager.
 */
import { sortLedger, statusOf } from '@/lib/commitments';

export type TeamRow = {
  id: string;
  direction: 'we_owe' | 'they_owe' | 'unanswered_ask';
  status: 'open' | 'done' | 'dismissed' | 'reassigned';
  owner_member_id: string | null;
  client_id: string | null;
  deadline: string | null;
  created_at: string;
};

const DAY = 86_400_000;

export function lateDays(deadline: string | null, now: Date): number | null {
  if (!deadline || statusOf({ dueAt: deadline }, now) !== 'overdue') return null;
  return Math.floor((now.getTime() - new Date(deadline).getTime()) / DAY);
}

const sorted = <R extends TeamRow>(rows: R[], now: Date) =>
  sortLedger(rows.map((r) => ({ ...r, dueAt: r.deadline, createdAt: r.created_at })), now);

const oldestLate = (rows: TeamRow[], now: Date) =>
  rows.reduce<number | null>((max, r) => {
    const late = lateDays(r.deadline, now);
    return late === null ? max : Math.max(max ?? 0, late);
  }, null);

export type ClientRollup = {
  clientId: string | null;
  clientName: string;
  weOwe: number;
  weOweByOwner: { name: string; count: number }[];
  oldestLateDays: number | null;
  theyOwe: number;
  unanswered: number;
  rows: TeamRow[];
};

export function rollupByClient(
  rows: TeamRow[],
  names: { clients: Map<string, string>; members: Map<string, string> },
  now = new Date(),
): ClientRollup[] {
  const open = rows.filter((r) => r.status === 'open');
  const groups = new Map<string | null, TeamRow[]>();
  for (const r of open) groups.set(r.client_id, [...(groups.get(r.client_id) ?? []), r]);

  return [...groups.entries()]
    .map(([clientId, group]) => {
      const weOwe = group.filter((r) => r.direction === 'we_owe');
      const counts = new Map<string, number>();
      for (const r of weOwe) {
        const name = names.members.get(r.owner_member_id ?? '') ?? 'Unassigned';
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      return {
        clientId,
        clientName: names.clients.get(clientId ?? '') ?? 'Unknown client',
        weOwe: weOwe.length,
        weOweByOwner: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        oldestLateDays: oldestLate(group, now),
        theyOwe: group.filter((r) => r.direction === 'they_owe').length,
        unanswered: group.filter((r) => r.direction === 'unanswered_ask').length,
        rows: sorted(group, now),
      };
    })
    .sort((a, b) => (b.oldestLateDays ?? -1) - (a.oldestLateDays ?? -1) || b.rows.length - a.rows.length);
}

export type OwnerRollup = {
  memberId: string | null;
  name: string;
  open: number;
  overdue: number;
  oldestLateDays: number | null;
  rows: TeamRow[];
};

export function rollupByOwner(rows: TeamRow[], members: Map<string, string>, now = new Date()): OwnerRollup[] {
  // "Owner" is about what we owe and what we must answer; the client's own
  // promises (they_owe) are tracked per client, not charged to a person.
  const mine = rows.filter((r) => r.status === 'open' && r.direction !== 'they_owe');
  const groups = new Map<string | null, TeamRow[]>();
  for (const r of mine) groups.set(r.owner_member_id, [...(groups.get(r.owner_member_id) ?? []), r]);

  return [...groups.entries()]
    .map(([memberId, group]) => ({
      memberId,
      name: members.get(memberId ?? '') ?? 'Unassigned',
      open: group.length,
      overdue: group.filter((r) => lateDays(r.deadline, now) !== null).length,
      oldestLateDays: oldestLate(group, now),
      rows: sorted(group, now),
    }))
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
}
