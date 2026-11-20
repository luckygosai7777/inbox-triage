/** PATCH /api/teams/rows/:id — mark my row done, dismissed or open again. RLS: owner only. */
import { z } from 'zod';

import { HttpError, route } from '@/lib/api';
import { memberFor } from '@/lib/teams/context';

const schema = z.object({ status: z.enum(['open', 'done', 'dismissed']) });

export const PATCH = route(
  async ({ user, db, input, params }) => {
    await memberFor(user.id);
    const { data } = await (db as any)
      .from('ledger_rows')
      .update({ status: input.status })
      .eq('id', params.id)
      .select('id');
    if (!data?.length) throw new HttpError(404, 'Row not found, or not yours.');
    return { ok: true };
  },
  { schema },
);
