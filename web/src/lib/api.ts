/**
 * Shared plumbing for API route handlers: auth, validation, rate limiting and
 * error shaping.
 *
 * `route()` wraps a handler so that every endpoint gets the same treatment
 * without each one remembering to do it. The rules it enforces:
 *
 *   - The caller must be signed in, and the user id comes from a validated JWT,
 *     never from the request body.
 *   - Input is parsed with a Zod schema; anything unexpected is rejected with a
 *     400 rather than reaching the database.
 *   - Expensive operations are rate limited per user, in Postgres, because
 *     serverless invocations do not share memory.
 *   - Unhandled errors return a generic message. Stack traces and database
 *     errors are logged server-side, not sent to the client, since they leak
 *     schema and library versions.
 */
import 'server-only';

import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { isDemo } from './demo';
import { adminClient, currentUser, serverClient, type SupabaseServer } from './supabase';

export type Ctx<T> = {
  req: NextRequest;
  user: User;
  db: SupabaseServer;
  input: T;
  params: Record<string, string>;
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type Limit = { bucket: string; max: number; windowSeconds: number };

type Options<T> = {
  // Input side is widened: schemas using .default() accept a partial object
  // and produce a complete one, which is what handlers receive.
  schema?: z.ZodType<T, z.ZodTypeDef, any>;
  limit?: Limit;
};

/**
 * Fixed-window rate limiter backed by Postgres.
 *
 * Protects two things: Gmail's API quota, and the Anthropic bill. A runaway
 * client (or a stolen session) cannot spend either without hitting this first.
 */
async function checkRateLimit(userId: string, limit: Limit): Promise<void> {
  const db = adminClient();
  const now = new Date();

  const { data: row } = await (db as any)
    .from('rate_limits')
    .select('window_start, count')
    .eq('user_id', userId)
    .eq('bucket', limit.bucket)
    .maybeSingle();

  const windowStart = row?.window_start ? new Date(row.window_start as string) : null;
  const expired =
    !windowStart || now.getTime() - windowStart.getTime() >= limit.windowSeconds * 1000;

  if (expired) {
    await (db as any)
      .from('rate_limits')
      .upsert(
        { user_id: userId, bucket: limit.bucket, window_start: now.toISOString(), count: 1 },
        { onConflict: 'user_id,bucket' },
      );
    return;
  }

  const count = Number(row?.count ?? 0);
  if (count >= limit.max) {
    const resetsAt = new Date(windowStart!.getTime() + limit.windowSeconds * 1000);
    throw new HttpError(429, 'Rate limit reached. Try again shortly.', {
      resets_at: resetsAt.toISOString(),
      limit: limit.max,
    });
  }

  await (db as any)
    .from('rate_limits')
    .update({ count: count + 1 })
    .eq('user_id', userId)
    .eq('bucket', limit.bucket);
}

export function route<T = unknown>(
  handler: (ctx: Ctx<T>) => Promise<NextResponse | unknown>,
  options: Options<T> = {},
) {
  return async (
    req: NextRequest,
    context: { params?: Promise<Record<string, string>> } = {},
  ): Promise<NextResponse> => {
    try {
      const user = await currentUser();
      if (!user) {
        return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
      }

      if (options.limit && !isDemo()) await checkRateLimit(user.id, options.limit);

      let input = undefined as T;
      if (options.schema) {
        let raw: unknown;
        if (req.method === 'GET' || req.method === 'DELETE') {
          raw = Object.fromEntries(req.nextUrl.searchParams.entries());
        } else {
          const contentType = req.headers.get('content-type') ?? '';
          if (contentType.includes('application/json')) {
            raw = await req.json().catch(() => ({}));
          } else if (contentType.includes('form')) {
            raw = Object.fromEntries((await req.formData()).entries());
          } else {
            raw = {};
          }
        }
        const parsed = options.schema.safeParse(raw);
        if (!parsed.success) {
          return NextResponse.json(
            {
              error: 'Invalid request',
              details: parsed.error.issues.map((i) => ({
                field: i.path.join('.'),
                message: i.message,
              })),
            },
            { status: 400 },
          );
        }
        input = parsed.data;
      }

      const params = context.params ? await context.params : {};
      // Demo mode has no Supabase project; handlers branch before touching db.
      const db = isDemo() ? (null as unknown as SupabaseServer) : await serverClient();
      const result = await handler({ req, user, db, input, params });

      if (result instanceof NextResponse) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json(
          { error: error.message, ...(error.extra ?? {}) },
          { status: error.status },
        );
      }
      // Log the detail, return a generic message. Database errors name tables
      // and columns; stack traces name library versions.
      console.error('[api]', req.method, req.nextUrl.pathname, error);
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
    }
  };
}

/** Throws unless the Supabase call succeeded. Keeps handlers free of if-blocks. */
export function must<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new HttpError(500, result.error.message);
  if (result.data === null) throw new HttpError(404, 'Not found');
  return result.data;
}
