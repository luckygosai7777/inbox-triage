/**
 * The Commitment Ledger API.
 *
 * GET  /api/commitments        — the ledger, ordered overdue-first
 * PATCH /api/commitments       — close, reopen or drop rows
 *
 * Reads go through the user-scoped Supabase client, so Row Level Security is in
 * force: even a bug in the filter below cannot return another account's rows.
 */
import { z } from 'zod';

import { route, HttpError } from '@/lib/api';
import { sortLedger, statusOf, summarise, ageInDays } from '@/lib/commitments';
import { demoCommitments, isDemo } from '@/lib/demo';

const querySchema = z.object({
  direction: z.enum(['owed', 'awaiting', 'all']).default('all'),
  status: z.enum(['open', 'done', 'dropped', 'all']).default('open'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const GET = route<z.infer<typeof querySchema>>(
  async ({ db, user, input }) => {
    if (isDemo()) {
      const now = new Date();
      const rows = demoCommitments().filter(
        (row) =>
          (input.direction === 'all' || row.direction === input.direction) &&
          (input.status === 'all' || row.status === input.status),
      );
      const ordered = sortLedger(rows, now).map((row) => ({
        ...row,
        state: statusOf(row, now),
        ageDays: ageInDays(row.createdAt, now),
      }));
      return { results: ordered, summary: summarise(rows, now) };
    }

    let query = db
      .from('commitments')
      .select(
        'id, direction, what, counterparty, counterparty_email, evidence, due_at, ' +
          'due_text, confidence, status, auto_resolved_hint, created_at, thread_id',
      )
      .eq('user_id', user.id)
      .limit(input.limit);

    if (input.direction !== 'all') query = query.eq('direction', input.direction);
    if (input.status !== 'all') query = query.eq('status', input.status);

    const { data, error } = await query;
    if (error) throw new HttpError(500, error.message);

    const now = new Date();
    const rows = (data ?? []).map((row: any) => ({
      id: row.id as string,
      direction: row.direction as 'owed' | 'awaiting',
      what: row.what as string,
      counterparty: row.counterparty as string,
      counterpartyEmail: row.counterparty_email as string,
      evidence: row.evidence as string,
      dueAt: row.due_at as string | null,
      dueText: row.due_text as string,
      confidence: row.confidence as 'high' | 'low',
      status: row.status as string,
      resolvedHint: row.auto_resolved_hint as boolean,
      createdAt: row.created_at as string,
      threadId: row.thread_id as string | null,
    }));

    const ordered = sortLedger(rows, now).map((row) => ({
      ...row,
      state: statusOf(row, now),
      ageDays: ageInDays(row.createdAt, now),
    }));

    return { results: ordered, summary: summarise(rows, now) };
  },
  { schema: querySchema },
);

const patchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(['open', 'done', 'dropped']),
});

export const PATCH = route<z.infer<typeof patchSchema>>(
  async ({ db, user, input }) => {
    // Demo data is a fixture, so a write has nothing to persist to.
    if (isDemo()) return { updated: input.ids.length, status: input.status, demo: true };

    const { data, error } = await db
      .from('commitments')
      .update({
        status: input.status,
        resolved_at: input.status === 'open' ? null : new Date().toISOString(),
        // Clearing the hint stops a closed-then-reopened row nagging again.
        auto_resolved_hint: false,
      })
      .eq('user_id', user.id)
      .in('id', input.ids)
      .select('id');

    if (error) throw new HttpError(500, error.message);
    return { updated: (data ?? []).length, status: input.status };
  },
  { schema: patchSchema },
);
