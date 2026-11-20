/**
 * Starts Google sign-in: mints state + PKCE, remembers them in a short-lived
 * cookie, and sends the browser to Google's consent screen. The callback
 * finishes the job. See lib/oauth.ts for why the app runs this itself.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/lib/env';
import { authUrl, GOOGLE_SCOPES, newAttempt, OAUTH_COOKIE, OAUTH_COOKIE_PATH, TEAMS_SCOPES } from '@/lib/oauth';

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const config = env();
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Google sign-in is not configured.')}`);
  }
  // ?for=teams connects a team mailbox (Owed for Teams), where it is switched on.
  const teams = config.TEAMS_ENABLED && request.nextUrl.searchParams.get('for') === 'teams';

  const attempt = newAttempt(teams);
  const response = NextResponse.redirect(
    authUrl(config.GOOGLE_CLIENT_ID, origin, attempt.state, attempt.verifier, teams ? TEAMS_SCOPES : GOOGLE_SCOPES),
  );
  response.cookies.set(OAUTH_COOKIE, attempt.cookie, {
    httpOnly: true,
    // Lax still travels on Google's top-level GET back to the callback.
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: OAUTH_COOKIE_PATH,
    maxAge: 600,
  });
  return response;
}
