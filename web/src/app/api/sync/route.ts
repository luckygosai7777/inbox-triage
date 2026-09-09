/**
 * POST /api/sync — pull recent mail and rebuild the ledger.
 *
 * The most expensive endpoint in the app: it hits Gmail's quota and spends
 * Anthropic tokens. Rate limited hard per user, because a runaway client or a
 * stolen session would otherwise burn both.
 */
import { z } from 'zod';

import { route, HttpError } from '@/lib/api';
import { GoogleNotConnected, syncCalendar, syncMailbox } from '@/lib/gmail';

const schema = z.object({
  max_results: z.coerce.number().int().min(1).max(200).optional(),
});

export const POST = route<z.infer<typeof schema>>(
  async ({ user, input }) => {
    try {
      const result = await syncMailbox(user.id, input.max_results);

      // The calendar is optional; a failure here must not fail the sync.
      let calendarBlocks = 0;
      try {
        calendarBlocks = await syncCalendar(user.id);
      } catch (error) {
        console.warn('[sync] calendar skipped:', (error as Error).message);
      }

      return { ...result, calendar_blocks: calendarBlocks };
    } catch (error) {
      if (error instanceof GoogleNotConnected) {
        throw new HttpError(409, error.message);
      }
      throw error;
    }
  },
  {
    schema,
    // Six syncs an hour is generous for a mailbox that changes slowly, and caps
    // the worst case cost of a compromised session.
    limit: { bucket: 'sync', max: 6, windowSeconds: 3600 },
  },
);

// Sync can take longer than the default serverless budget on a first run.
export const maxDuration = 60;
