import { describe, expect, it } from 'vitest';

import { lateDays, rollupByClient, rollupByOwner, type TeamRow } from '@/lib/teams/rollup';

const now = new Date('2026-11-20T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
let n = 0;
const row = (over: Partial<TeamRow>): TeamRow => ({
  id: `r${n++}`,
  direction: 'we_owe',
  status: 'open',
  owner_member_id: 'ravi',
  client_id: 'acme',
  deadline: null,
  created_at: daysAgo(10),
  ...over,
});

const names = {
  clients: new Map([['acme', 'Acme'], ['globex', 'Globex']]),
  members: new Map([['ravi', 'Ravi'], ['priya', 'Priya']]),
};

describe('rollupByClient', () => {
  it('gives the manager line: we owe 3 (Ravi 2, Priya 1, oldest 6 days late), they owe 1, 2 asks', () => {
    const rows = [
      row({ deadline: daysAgo(6) }),
      row({ deadline: daysAgo(2) }),
      row({ owner_member_id: 'priya' }),
      row({ direction: 'they_owe', owner_member_id: null }),
      row({ direction: 'unanswered_ask' }),
      row({ direction: 'unanswered_ask', owner_member_id: 'priya' }),
      row({ status: 'done' }), // closed rows never count
      row({ client_id: 'globex' }),
    ];
    const [acme, globex] = rollupByClient(rows, names, now);
    expect(acme).toMatchObject({
      clientName: 'Acme',
      weOwe: 3,
      weOweByOwner: [{ name: 'Ravi', count: 2 }, { name: 'Priya', count: 1 }],
      oldestLateDays: 6,
      theyOwe: 1,
      unanswered: 2,
    });
    expect(acme.rows).toHaveLength(6);
    expect(acme.rows[0].deadline).toBe(daysAgo(6)); // most overdue first
    expect(globex.clientName).toBe('Globex');
  });

  it('puts the client with the oldest lateness first', () => {
    const rows = [row({ client_id: 'globex', deadline: daysAgo(1) }), row({ client_id: 'acme', deadline: daysAgo(9) })];
    expect(rollupByClient(rows, names, now).map((c) => c.clientName)).toEqual(['Acme', 'Globex']);
  });
});

describe('rollupByOwner', () => {
  it("counts what each person owes and must answer, not the client's own promises", () => {
    const rows = [
      row({ deadline: daysAgo(3) }),
      row({}),
      row({ owner_member_id: 'priya', direction: 'unanswered_ask' }),
      row({ direction: 'they_owe' }),
    ];
    const [ravi, priya] = rollupByOwner(rows, names.members, now);
    expect(ravi).toMatchObject({ name: 'Ravi', open: 2, overdue: 1, oldestLateDays: 3 });
    expect(priya).toMatchObject({ name: 'Priya', open: 1, overdue: 0, oldestLateDays: null });
  });
});

describe('lateDays', () => {
  it('is null for undated or not-yet-due rows', () => {
    expect(lateDays(null, now)).toBeNull();
    expect(lateDays(new Date(now.getTime() + 86_400_000).toISOString(), now)).toBeNull();
    expect(lateDays(daysAgo(4), now)).toBe(4);
  });
});
