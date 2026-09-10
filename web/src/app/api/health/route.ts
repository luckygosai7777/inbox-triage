/**
 * GET /api/health — what does this deployment actually have?
 *
 * Added after an afternoon of guessing why sync reported
 * "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured" when the
 * variables appeared to be set in the dashboard. Reading a value out of a
 * running deployment is otherwise impossible from outside, which turns a
 * two-minute config problem into a long guessing game.
 *
 * SAFETY: reports presence and shape only — never a value, not even a prefix
 * of a secret. Requires a signed-in session, so it is not public reconnaissance.
 */
import { route } from '@/lib/api';
import { isDemo } from '@/lib/demo';
import { adminClient } from '@/lib/supabase';

/** Length and a coarse shape, so a truncated paste is visible without leaking. */
function describe(value: string | undefined, expect?: RegExp) {
  const raw = value ?? '';
  const trimmed = raw.trim();
  if (!trimmed) return { set: false as const };
  return {
    set: true as const,
    length: trimmed.length,
    // A value pasted with a trailing newline is a classic silent failure.
    hasWhitespace: raw !== trimmed,
    looksRight: expect ? expect.test(trimmed) : undefined,
  };
}

export const GET = route(async ({ user }) => {
  const env = process.env;

  const config = {
    NEXT_PUBLIC_SUPABASE_URL: describe(env.NEXT_PUBLIC_SUPABASE_URL, /^https:\/\/.+\.supabase\.co$/),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: describe(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: describe(env.SUPABASE_SERVICE_ROLE_KEY),
    TOKEN_ENCRYPTION_KEY: describe(env.TOKEN_ENCRYPTION_KEY),
    GOOGLE_CLIENT_ID: describe(env.GOOGLE_CLIENT_ID, /\.apps\.googleusercontent\.com$/),
    GOOGLE_CLIENT_SECRET: describe(env.GOOGLE_CLIENT_SECRET, /^GOCSPX-/),
    ANTHROPIC_API_KEY: describe(env.ANTHROPIC_API_KEY),
    CRON_SECRET: describe(env.CRON_SECRET),
    APP_URL: describe(env.APP_URL),
  };

  // Is this user's Google connection actually usable?
  let google: Record<string, unknown> = { checked: false };
  if (!isDemo()) {
    try {
      const db = adminClient();
      const { data } = await db
        .from('profiles')
        .select('email, google_refresh_token_enc, last_synced_at')
        .eq('id', user.id)
        .maybeSingle();

      const token = (data as any)?.google_refresh_token_enc as string | null;
      google = {
        checked: true,
        profileRowExists: Boolean(data),
        refreshTokenStored: Boolean(token),
        refreshTokenEncrypted: typeof token === 'string' && token.startsWith('v1.'),
        lastSyncedAt: (data as any)?.last_synced_at ?? null,
      };
    } catch (error) {
      google = { checked: true, error: (error as Error).message };
    }
  }

  const missing = Object.entries(config)
    .filter(([, v]) => !v.set)
    .map(([k]) => k);

  return {
    deployment: {
      commit: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      region: env.VERCEL_REGION ?? 'local',
      // Confirms whether the running build is the one you think it is.
      builtAt: env.VERCEL_DEPLOYMENT_ID ?? 'local',
    },
    config,
    google,
    missing,
    syncReady: missing.filter((k) => k.startsWith('GOOGLE_')).length === 0,
  };
});
