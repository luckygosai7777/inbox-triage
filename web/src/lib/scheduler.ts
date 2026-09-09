/**
 * Calendar-aware reply planning.
 *
 * Free gaps come from the day's busy blocks; each gap donates at most
 * `blockMinutes` to email so the rest of the gap stays the user's. Replies are
 * packed deadline-first, then by priority, then shortest-first so a block fills
 * rather than blocks.
 */

export type Slot = { key: string; start: number; end: number; cap: number };
export type Meeting = { title: string; start: number; end: number };

export type Schedulable = {
  id: string;
  priority: number;
  effortMinutes: number;
  dueAt: Date | string | null;
};

export type Plan<T extends Schedulable> = {
  slots: Slot[];
  bySlot: Record<string, T[]>;
  used: Record<string, number>;
  overflow: T[];
  totalCapacity: number;
};

export const DEFAULTS = {
  dayStart: 9,
  dayEnd: 18,
  minGapMinutes: 20,
  blockMinutes: 30,
};

export function hhmm(hours: number): string {
  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Gaps between meetings inside working hours, each capped at blockMinutes. */
export function freeGaps(
  meetings: Meeting[],
  blockMinutes = DEFAULTS.blockMinutes,
  options: { dayStart?: number; dayEnd?: number; minGapMinutes?: number } = {},
): Slot[] {
  const dayStart = options.dayStart ?? DEFAULTS.dayStart;
  const dayEnd = options.dayEnd ?? DEFAULTS.dayEnd;
  const minGapHours = (options.minGapMinutes ?? DEFAULTS.minGapMinutes) / 60;

  const gaps: Array<[number, number]> = [];
  let cursor = dayStart;

  for (const meeting of [...meetings].sort((a, b) => a.start - b.start)) {
    if (meeting.end <= dayStart || meeting.start >= dayEnd) continue;
    if (meeting.start - cursor >= minGapHours) {
      gaps.push([cursor, Math.min(meeting.start, dayEnd)]);
    }
    cursor = Math.max(cursor, meeting.end);
  }
  if (dayEnd - cursor >= minGapHours) gaps.push([cursor, dayEnd]);

  return gaps.map(([start, end], index) => ({
    key: `g${index}`,
    start,
    end,
    cap: Math.min(Math.round((end - start) * 60), blockMinutes),
  }));
}

/**
 * The deadline as an hour of `day`, or null.
 *
 * A deadline that already passed, or falls on another day, does not constrain
 * which block on `day` the reply can go in.
 */
function dueHour(item: Schedulable, day: Date): number | null {
  if (!item.dueAt) return null;
  const due = item.dueAt instanceof Date ? item.dueAt : new Date(item.dueAt);
  if (Number.isNaN(due.getTime())) return null;
  if (
    due.getFullYear() !== day.getFullYear() ||
    due.getMonth() !== day.getMonth() ||
    due.getDate() !== day.getDate()
  ) {
    return null;
  }
  return due.getHours() + due.getMinutes() / 60;
}

export function pack<T extends Schedulable>(
  items: T[],
  slots: Slot[],
  assignments: Record<string, string> = {},
  day: Date = new Date(),
): Plan<T> {
  const slotKeys = new Set(slots.map((slot) => slot.key));
  const bySlot: Record<string, T[]> = {};
  const used: Record<string, number> = {};
  for (const slot of slots) {
    bySlot[slot.key] = [];
    used[slot.key] = 0;
  }
  const overflow: T[] = [];

  const pinned: T[] = [];
  const loose: T[] = [];
  for (const item of items) {
    const target = assignments[item.id];
    if (target && slotKeys.has(target)) pinned.push(item);
    else loose.push(item);
  }

  // Pinned first: a manual move outranks the packer, even past capacity.
  for (const item of pinned) {
    const key = assignments[item.id];
    bySlot[key].push(item);
    used[key] += item.effortMinutes;
  }

  loose.sort((a, b) => {
    const dueA = dueHour(a, day);
    const dueB = dueHour(b, day);
    if ((dueA === null) !== (dueB === null)) return dueA === null ? 1 : -1;
    if (dueA !== null && dueB !== null && dueA !== dueB) return dueA - dueB;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.effortMinutes - b.effortMinutes;
  });

  for (const item of loose) {
    const due = dueHour(item, day);
    const fits = slots.filter(
      (slot) =>
        used[slot.key] + item.effortMinutes <= slot.cap && (due === null || slot.start <= due),
    );
    if (!fits.length) {
      overflow.push(item);
      continue;
    }
    // Deadline work takes the earliest block that works; everything else takes
    // the emptiest, so the day spreads instead of front-loading.
    const chosen =
      due !== null
        ? fits[0]
        : fits.reduce((best, slot) =>
            used[slot.key] / slot.cap < used[best.key] / best.cap ? slot : best,
          );
    bySlot[chosen.key].push(item);
    used[chosen.key] += item.effortMinutes;
  }

  return {
    slots,
    bySlot,
    used,
    overflow,
    totalCapacity: slots.reduce((sum, slot) => sum + slot.cap, 0),
  };
}

/** True when a reply sits in a block that starts after its own deadline. */
export function violatesDeadline(item: Schedulable, slot: Slot, day: Date): boolean {
  const due = dueHour(item, day);
  return due !== null && slot.start > due;
}

export function minutesToHours(minutes: number): number {
  return minutes / 60;
}
