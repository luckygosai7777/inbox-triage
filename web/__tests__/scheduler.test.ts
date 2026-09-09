import { describe, expect, it } from 'vitest';

import {
  freeGaps,
  hhmm,
  pack,
  violatesDeadline,
  type Meeting,
  type Schedulable,
} from '@/lib/scheduler';

const DAY = new Date(2026, 8, 2, 0, 0, 0);

// The prototype's agenda: standup, design review, lunch, 1:1, client call.
const MEETINGS: Meeting[] = [
  { title: 'Standup', start: 9, end: 9.25 },
  { title: 'Design review', start: 10.5, end: 11.5 },
  { title: 'Lunch', start: 12.5, end: 13 },
  { title: '1:1 - Priya', start: 14, end: 14.5 },
  { title: 'Client call', start: 15.5, end: 16.5 },
];

let counter = 0;
function item(effort: number, priority = 1, dueHour: number | null = null): Schedulable {
  counter += 1;
  const dueAt = dueHour === null ? null : new Date(2026, 8, 2, dueHour, 0, 0);
  return { id: `m${counter}`, priority, effortMinutes: effort, dueAt };
}

describe('freeGaps', () => {
  it('finds the gaps between meetings', () => {
    const spans = freeGaps(MEETINGS, 30).map((s) => [s.start, s.end]);
    expect(spans).toEqual([
      [9.25, 10.5],
      [11.5, 12.5],
      [13, 14],
      [14.5, 15.5],
      [16.5, 18],
    ]);
  });

  it('caps every block at blockMinutes', () => {
    expect(freeGaps(MEETINGS, 15).every((s) => s.cap === 15)).toBe(true);
  });

  it('drops a gap shorter than the minimum', () => {
    const gaps = freeGaps(
      [
        { title: 'A', start: 9, end: 10 },
        { title: 'B', start: 10.1, end: 12 }, // a 6 minute gap
      ],
      30,
    );
    expect(gaps.map((s) => [s.start, s.end])).not.toContainEqual([10, 10.1]);
  });

  it('gives one capped block on an empty calendar', () => {
    const gaps = freeGaps([], 30);
    expect(gaps).toHaveLength(1);
    expect([gaps[0].start, gaps[0].end]).toEqual([9, 18]);
    expect(gaps[0].cap).toBe(30); // capped, not the full 540 minutes
  });

  it('handles a meeting fully inside another', () => {
    const gaps = freeGaps(
      [
        { title: 'A', start: 9, end: 12 },
        { title: 'B', start: 10, end: 11 },
      ],
      30,
    );
    expect(gaps.map((s) => [s.start, s.end])).toEqual([[12, 18]]);
  });

  it('formats times', () => {
    expect(hhmm(9.25)).toBe('09:15');
    expect(hhmm(16.5)).toBe('16:30');
    expect(hhmm(18)).toBe('18:00');
  });
});

describe('pack', () => {
  const slots = () => freeGaps(MEETINGS, 30);

  it('places everything when there is room', () => {
    const items = [item(5), item(5), item(5), item(5)];
    const plan = pack(items, slots(), {}, DAY);
    const placed = Object.values(plan.bySlot).reduce((n, g) => n + g.length, 0);
    expect(placed).toBe(4);
    expect(plan.overflow).toHaveLength(0);
  });

  it('lands deadline work before its deadline', () => {
    const urgent = item(10, 0, 11);
    const filler = [item(10, 2), item(10, 2), item(10, 2)];
    const plan = pack([...filler, urgent], slots(), {}, DAY);

    const key = Object.keys(plan.bySlot).find((k) =>
      plan.bySlot[k].some((i) => i.id === urgent.id),
    )!;
    const slot = slots().find((s) => s.key === key)!;
    expect(slot.start).toBeLessThanOrEqual(11);
    expect(violatesDeadline(urgent, slot, DAY)).toBe(false);
  });

  it('never exceeds a block capacity', () => {
    const items = Array.from({ length: 20 }, () => item(12));
    const plan = pack(items, slots(), {}, DAY);
    for (const slot of slots()) {
      expect(plan.used[slot.key]).toBeLessThanOrEqual(slot.cap);
    }
  });

  it('overflows what does not fit, losing nothing', () => {
    const items = Array.from({ length: 10 }, () => item(25));
    const plan = pack(items, slots(), {}, DAY);
    const placed = Object.values(plan.bySlot).reduce((n, g) => n + g.length, 0);
    expect(plan.overflow.length).toBeGreaterThan(0);
    expect(placed + plan.overflow.length).toBe(items.length);
  });

  it('spreads load instead of front-loading', () => {
    const items = Array.from({ length: 5 }, () => item(10));
    const plan = pack(items, slots(), {}, DAY);
    const used = slots().map((s) => plan.used[s.key]);
    expect(used.filter((u) => u > 0).length).toBeGreaterThanOrEqual(2);
  });

  it('honours a manual pin over the packer', () => {
    const pinned = item(10, 2);
    const target = slots()[slots().length - 1].key;
    const plan = pack([pinned], slots(), { [pinned.id]: target }, DAY);
    expect(plan.bySlot[target].map((i) => i.id)).toContain(pinned.id);
  });

  it('lets a manual pin overfill, and shows it', () => {
    // A manual move is the user's call; the UI shows the block over capacity
    // rather than silently relocating their choice.
    const items = [item(25), item(25), item(25)];
    const target = slots()[0].key;
    const assignments = Object.fromEntries(items.map((i) => [i.id, target]));
    const plan = pack(items, slots(), assignments, DAY);
    expect(plan.bySlot[target]).toHaveLength(3);
    expect(plan.used[target]).toBeGreaterThan(slots()[0].cap);
  });

  it('falls back to packing when a pin names an unknown slot', () => {
    const stray = item(5);
    const plan = pack([stray], slots(), { [stray.id]: 'nope' }, DAY);
    const placed = Object.values(plan.bySlot).reduce((n, g) => n + g.length, 0);
    expect(placed).toBe(1);
  });

  it('ignores a deadline on another day', () => {
    const later = { ...item(10), dueAt: new Date(2026, 8, 20, 9, 0, 0) };
    const plan = pack([later], slots(), {}, DAY);
    const placed = Object.values(plan.bySlot).reduce((n, g) => n + g.length, 0);
    expect(placed).toBe(1);
  });

  it('overflows rather than lying when the deadline precedes every block', () => {
    const missed = item(10, 0, 8);
    const plan = pack([missed], slots(), {}, DAY);
    expect(plan.overflow.map((i) => i.id)).toContain(missed.id);
  });

  it('reports total capacity', () => {
    expect(pack([], slots(), {}, DAY).totalCapacity).toBe(150); // 5 blocks x 30
  });
});
