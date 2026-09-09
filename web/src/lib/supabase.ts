/**
 * Supabase clients.
 *
 * Three of them, deliberately separated by trust level:
 *
 *   browserClient() — anon key, runs in the user's browser. Every query it makes
 *                     is filtered by Row Level Security, so it can only ever see
 *                     that user's rows.
 *   serverClient()  — anon key plus the request's session cookie. Used in server
 *                     components and route handlers. Still subject to RLS.
 *   adminClient()   — service-role key. BYPASSES RLS. Used only where the app
 *                     must act outside a user session (the auth callback writing
 *                     a profile, rate-limit counters). Never import this into a
 *                     client component.
 *
 * The default for any new code should be serverClient(). Reach for adminClient()
 * only when you can state why RLS must not apply, because it removes the
 * database-level guarantee that a bug cannot leak across accounts.
 */
import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { DEMO_USER, isDemo } from './demo';
import { env } from './env';

/**
 * Row types are loose until types are generated from the live schema with
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 * and swapped in here. Correctness does not depend on it: input is validated
 * by Zod at the route boundary, and access is enforced by Row Level Security
 * in Postgres, neither of which is a TypeScript concern.
 */
type Database = any;

/** What Supabase hands back to `setAll`. */
type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };


export async function serverClient() {
  const store = await cookies();
  const config = env();

  return createServerClient<Database>(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: CookieToSet[]) => {
        try {
          list.forEach(({ name, value, options }: CookieToSet) =>
            store.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              path: '/',
            }),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session instead, so this is safe to skip.
        }
      },
    },
  });
}

let admin: ReturnType<typeof createClient<Database>> | null = null;

export function adminClient() {
  const config = env();
  if (!config.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for this operation. Add it to your ' +
        'environment (Vercel → Settings → Environment Variables). Never expose it to the browser.',
    );
  }
  if (!admin) {
    admin = createClient<Database>(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return admin;
}

/** The signed-in user, or null. Never trust a user id from the request body. */
export async function currentUser() {
  // Demo mode has no Supabase project to validate against.
  if (isDemo()) return DEMO_USER as unknown as import('@supabase/supabase-js').User;

  const supabase = await serverClient();
  // getUser() validates the JWT against Supabase. getSession() only decodes the
  // cookie, which a client could have tampered with, so it is not used here.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) return null;
  return user;
}

export type SupabaseServer = Awaited<ReturnType<typeof serverClient>>;
