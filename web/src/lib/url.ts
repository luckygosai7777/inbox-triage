/**
 * The app's public base URL.
 *
 * Resolution order, most specific first:
 *
 *  1. APP_URL — set this once you have a custom domain. It is the only one that
 *     survives a domain change, so it wins.
 *  2. VERCEL_PROJECT_PRODUCTION_URL — Vercel injects this automatically and it
 *     always points at the production deployment, even when the code is running
 *     in a preview build. That is what a sitemap or an email link should use;
 *     linking a user to a preview deployment they cannot sign in to is worse
 *     than useless.
 *  3. localhost — development.
 *
 * This exists because a missing APP_URL silently produced a sitemap full of
 * http://localhost:3000 URLs on the first production deploy. Google would have
 * followed those and indexed nothing, and the OAuth review needs to be able to
 * reach the real privacy policy.
 */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`;

  return 'http://localhost:3000';
}
