/**
 * GET /api/mail — the inbox list, filtered and ranked.
 *
 * Filtering happens in Postgres (indexed) and only the surviving page is ranked
 * in JavaScript. Pulling the whole mailbox into memory to sort it would not
 * survive a real account.
 */
import { z } from 'zod';

import { route, HttpError } from '@/lib/api';
import { DEMO_VIPS, demoMail, isDemo } from '@/lib/demo';
import { search, type Searchable } from '@/lib/search';

const FILTERS = ['All', 'Needs reply', 'Clients', 'Newsletters', 'Receipts'] as const;

const schema = z.object({
  filter: z.enum(FILTERS).default('All'),
  search: z.string().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const GET = route<z.infer<typeof schema>>(
  async ({ db, user, input }) => {
    if (isDemo()) {
      const all = demoMail();
      const filtered = all.filter((row) =>
        input.filter === 'All'
          ? true
          : input.filter === 'Needs reply'
            ? row.needsReply
            : row.category === input.filter,
      );
      const hits = search(filtered as any, input.search);
      return {
        results: hits.map((hit) => ({
          ...hit.item,
          isVip: DEMO_VIPS.has(String((hit.item as any).fromEmail)),
          showAddress: hit.matchedPerson,
          score: hit.score,
        })),
        count: hits.length,
        filters: ['All', 'Needs reply', 'Clients', 'Newsletters', 'Receipts'].map((label) => ({
          label,
          count:
            label === 'All'
              ? all.length
              : label === 'Needs reply'
                ? all.filter((r) => r.needsReply).length
                : all.filter((r) => r.category === label).length,
        })),
      };
    }

    const [{ data: muted }, { data: vips }] = await Promise.all([
      db.from('subscriptions').select('sender_email').eq('user_id', user.id).eq('status', 'muted'),
      db.from('vip_senders').select('email').eq('user_id', user.id),
    ]);

    const mutedEmails = (muted ?? []).map((row: any) => row.sender_email as string);
    const vipEmails = new Set((vips ?? []).map((row: any) => String(row.email).toLowerCase()));

    const base = () => {
      let query = db
        .from('messages')
        .select(
          'id, gmail_message_id, thread_id, from_email, from_name, subject, preview, ' +
            'sent_at, is_unread, category, priority, needs_reply, effort_minutes, due_at, topics',
          { count: 'exact' },
        )
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .eq('is_outbound', false);
      if (mutedEmails.length) {
        query = query.not('from_email', 'in', `(${mutedEmails.map((e) => `"${e}"`).join(',')})`);
      }
      return query;
    };

    let query = base();
    if (input.filter === 'Needs reply') query = query.eq('needs_reply', true);
    else if (input.filter !== 'All') query = query.eq('category', input.filter);

    // A search needs the candidate set to rank; an unfiltered list can page in
    // the database directly.
    const { data, error, count } = input.search
      ? await query.order('priority').order('sent_at', { ascending: false }).limit(500)
      : await query
          .order('priority')
          .order('sent_at', { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);

    if (error) throw new HttpError(500, error.message);

    const items: Array<Searchable & Record<string, unknown>> = (data ?? []).map((row: any) => ({
      id: row.id,
      gmailMessageId: row.gmail_message_id,
      threadId: row.thread_id,
      fromName: row.from_name ?? '',
      fromEmail: row.from_email ?? '',
      subject: row.subject ?? '',
      category: row.category ?? '',
      preview: row.preview ?? '',
      topics: row.topics ?? '',
      priority: row.priority ?? 2,
      sentAt: row.sent_at,
      isUnread: row.is_unread,
      needsReply: row.needs_reply,
      effortMinutes: row.effort_minutes,
      dueAt: row.due_at,
    }));

    const hits = search(items, input.search);
    const page = input.search ? hits.slice(input.offset, input.offset + input.limit) : hits;

    const results = page.map((hit) => ({
      ...hit.item,
      isVip: vipEmails.has(String(hit.item.fromEmail).toLowerCase()),
      showAddress: hit.matchedPerson,
      score: hit.score,
    }));

    // Counts for the filter chips, one grouped read rather than five.
    const { data: all } = await base();
    const rows = (all ?? []) as any[];
    const filters = FILTERS.map((label) => ({
      label,
      count:
        label === 'All'
          ? rows.length
          : label === 'Needs reply'
            ? rows.filter((r) => r.needs_reply).length
            : rows.filter((r) => r.category === label).length,
    }));

    return {
      results,
      count: input.search ? hits.length : (count ?? rows.length),
      filters,
    };
  },
  { schema },
);
