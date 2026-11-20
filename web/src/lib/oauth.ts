/**
 * Google sign-in, run by the app itself rather than by Supabase.
 *
 * Supabase's hosted flow sent Google back to <project>.supabase.co, and Google
 * verification requires every redirect-URI domain to be one we own and have
 * verified in Search Console. supabase.co can never be. So Google now redirects
 * to our own /auth/callback, the code is exchanged here, and Supabase is handed
 * the resulting ID token (signInWithIdToken) to issue its session.
 *
 * The flow is a confidential-client code flow with PKCE and a state value; both
 * travel in one short-lived httpOnly cookie between /auth/google and the
 * callback.
 */
import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { google } from 'googleapis';

import { safeEqual } from './crypto';
import { env } from './env';

/**
 * The narrowest set the features need: read mail (inbox triage, the Ledger's
 * sent mail), send a reply only when the user presses Send, and read calendar
 * times. gmail.modify was held for archiving, which no screen offers; Google
 * asks for the narrowest scope that works, so it is no longer requested.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
];

/**
 * Owed for Teams asks for less: read mail, and save drafts. It never sends
 * (docs/AUDIT.md, D1), so no gmail.send and no calendar.
 */
export const TEAMS_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
];

// The flow rides in `state`, which the callback only trusts after matching it
// against the httpOnly cookie, so it cannot be switched by a forged link.
const TEAMS_PREFIX = 'teams~';
export const isTeamsState = (state: string | null) => Boolean(state?.startsWith(TEAMS_PREFIX));

export const OAUTH_COOKIE = 'owed_oauth';
// Scoped to the callback, the only route that needs to read it.
export const OAUTH_COOKIE_PATH = '/auth/callback';

export const redirectUri = (origin: string) => `${origin}/auth/callback`;

/** RFC 7636 S256: the challenge is the base64url SHA-256 of the verifier. */
export const pkceChallenge = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url');

/** A fresh state + PKCE verifier, and the cookie value that carries them. */
export function newAttempt(teams = false) {
  const state = (teams ? TEAMS_PREFIX : '') + randomBytes(24).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  return { state, verifier, cookie: `${state}.${verifier}` };
}

/**
 * The PKCE verifier, if the returning `state` matches the one this browser was
 * given; otherwise null. A mismatch means the callback was not started by this
 * browser's own sign-in (CSRF, or a stale tab), and must not be completed.
 */
export function readAttempt(cookie: string | undefined, state: string | null): string | null {
  if (!cookie || !state) return null;
  const dot = cookie.indexOf('.');
  if (dot < 1) return null;
  const verifier = cookie.slice(dot + 1);
  return verifier && safeEqual(cookie.slice(0, dot), state) ? verifier : null;
}

/** Google's consent URL. offline + consent is what returns a refresh token. */
export function authUrl(
  clientId: string,
  origin: string,
  state: string,
  verifier: string,
  scopes = GOOGLE_SCOPES,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function googleClient(origin: string) {
  const config = env();
  return new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, redirectUri(origin));
}
