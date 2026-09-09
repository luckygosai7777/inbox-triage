/**
 * GET /api/schedule — today's blocks with replies packed into them.
 *
 * Deadlines are formatted server-side, in the same timezone the packer used.
 * Letting the browser format them would show a time that contradicts the block
 * it sits in whenever the two timezones differ.
 */
import { z } from 'zod';

import { route, HttpError } from '@/lib/api';
import { DEMO_VIPS, demoMail, demoMeetings, isDemo } from '@/lib/demo';
import {
  freeGaps,
  hhmm,
  pack,
  violatesDeadline,
  type Meeting,
  type Schedulable,
} from '@/lib/scheduler';

const schema = z.object({
  block_minutes: z.coerce
    .number()
    .int()
    .refine((n) => [15, 30, 45].includes(n), {
      message: 'block_minutes must be 15, 30 or 45',
    })
    .default(30),
});

type Item = Schedulable & {
  fromName: string;
  fromEmail: string;
  subject: string;
  threadId: string | null;
};

/** Shared by the real and demo paths so both render identically. */
function buildSchedule(
  meetings: Meeting[],
  items: Item[],
  assignments: Record<string, string>,
  blockMinutes: number,
  day: Date,
  vipEmails: Set<string>,
) {
  const slots = freeGaps(meetings, blockMinutes);
  const plan = pack(items, slots, assignments, day);

  const shape = (item: Item, slot: ReturnType<typeof freeGaps>[number] | null) => ({
    id: item.id,
    threadId: item.threadId,
    fromName: item.fromName,
    fromEmail: item.fromEmail,
    subject: item.subject,
    effortMinutes: item.effortMinutes,
    priority: item.priority,
    isVip: vipEmails.has(String(item.fromEmail).toLowerCase()),
    hasDue: Boolean(item.dueAt),
    dueLabel: item.dueAt
      ? new Date(item.dueAt).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : '',
    violatesDeadline: Boolean(slot && violatesDeadline(item, slot, day)),
  });

  const rows = [
    ...slots.map((slot) => ({
      type: 'slot' as const,
      key: slot.key,
      start: hhmm(slot.start),
      end: hhmm(slot.end),
      startHour: slot.start,
      capacityMinutes: slot.cap,
      usedMinutes: plan.used[slot.key],
      overCapacity: plan.used[slot.key] > slot.cap,
      items: plan.bySlot[slot.key].map((item) => shape(item, slot)),
    })),
    ...meetings.map((meeting) => ({
      type: 'meeting' as const,
      title: meeting.title,
      start: hhmm(meeting.start),
      end: hhmm(meeting.end),
      startHour: meeting.start,
    })),
  ].sort((a, b) => a.startHour - b.startHour);

  const totalMinutes = items.reduce((sum, item) => sum + item.effortMinutes, 0);

  return {
    date: day.toISOString().slice(0, 10),
    blockMinutes,
    rows,
    overflow: plan.overflow.map((item) => shape(item, null)),
    overflowCount: plan.overflow.length,
    totalReplyMinutes: totalMinutes,
    capacityMinutes: plan.totalCapacity,
    fits: totalMinutes <= plan.totalCapacity,
    shortfallMinutes: Math.max(0, totalMinutes - plan.totalCapacity),
  };
}

export const GET = route<z.infer<typeof schema>>(
  async ({ db, user, input }) => {
    const today = new Date();
    const isoDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      .toISOString()
      .slice(0, 10);

    if (isDemo()) {
      const items: Item[] = demoMail()
        .filter((row) => row.needsReply)
        .map((row) => ({
          id: row.id,
          priority: row.priority,
          effortMinutes: row.effortMinutes,
          dueAt: row.dueAt,
          fromName: row.fromName,
          fromEmail: row.fromEmail,
          subject: row.subject,
          threadId: row.threadId,
        }));
      return buildSchedule(demoMeetings(), items, {}, input.block_minutes, today, DEMO_VIPS);
    }

    const [{ data: slotRows }, { data: mail, error }, { data: pins }, { data: vips }] =
      await Promise.all([
        db
          .from('calendar_slots')
          .select('title, start_min, end_min')
          .eq('user_id', user.id)
          .eq('day', isoDay)
          .eq('is_busy', true),
        db
          .from('messages')
          .select('id, from_name, from_email, subject, priority, effort_minutes, due_at, thread_id')
          .eq('user_id', user.id)
          .eq('needs_reply', true)
          .eq('is_archived', false)
          .eq('is_outbound', false),
        db
          .from('slot_assignments')
          .select('message_id, slot_key')
          .eq('user_id', user.id)
          .eq('day', isoDay),
        db.from('vip_senders').select('email').eq('user_id', user.id),
      ]);

    if (error) throw new HttpError(500, error.message);

    const meetings: Meeting[] = (slotRows ?? []).map((row: any) => ({
      title: row.title || 'Busy',
      start: row.start_min / 60,
      end: row.end_min / 60,
    }));

    const items: Item[] = (mail ?? []).map((row: any) => ({
      id: row.id,
      priority: row.priority ?? 2,
      effortMinutes: row.effort_minutes ?? 4,
      dueAt: row.due_at,
      fromName: row.from_name,
      fromEmail: row.from_email,
      subject: row.subject,
      threadId: row.thread_id,
    }));

    const assignments = Object.fromEntries(
      (pins ?? []).map((p: any) => [p.message_id as string, p.slot_key as string]),
    );
    const vipEmails = new Set((vips ?? []).map((v: any) => String(v.email).toLowerCase()));

    return buildSchedule(meetings, items, assignments, input.block_minutes, today, vipEmails);
  },
  { schema },
);
