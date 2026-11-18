/**
 * OAuth callback. Google redirects here after consent (see lib/oauth.ts).
 *
 * 1. The returning state must match the cookie /auth/google set, or the
 *    request was not started by this browser and is refused.
 * 2. The code is exchanged with Google directly, with the PKCE verifier.
 * 3. Supabase verifies the ID token and issues its session (cookies).
 * 4. Google's *refresh* token is encrypted and stored so background sync can
 *    reach Gmail without the user present.
 *
 * Every redirect is built from our own origin, never from a query parameter,
 * so this cannot be turned into an open redirect.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { encryptSecret } from '@/lib/crypto';
import { googleClient, OAUTH_COOKIE, OAUTH_COOKIE_PATH, readAttempt } from '@/lib/oauth';
import { adminClient, serverClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const origin = request.nextUrl.origin;

  const finish = (path: string) => {
    const response = NextResponse.redirect(`${origin}${path}`);
    response.cookies.set(OAUTH_COOKIE, '', { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return response;
  };
  const fail = (message: string) => finish(`/login?error=${encodeURIComponent(message)}`);

  const denied = params.get('error');
  if (denied) {
    return fail(denied === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in failed (${denied}).`);
  }

  const code = params.get('code');
  const verifier = readAttempt(request.cookies.get(OAUTH_COOKIE)?.value, params.get('state'));
  if (!code || !verifier) {
    return fail('That sign-in link expired or was started in another tab. Please try again.');
  }

  let tokens;
  try {
    ({ tokens } = await googleClient(origin).getToken({ code, codeVerifier: verifier }));
  } catch (caught) {
    console.error('[auth] Google code exchange failed:', (caught as Error).message);
    return fail('Google sign-in could not be completed. Please try again.');
  }
  if (!tokens.id_token) return fail('Google did not return an identity. Please try again.');

  const supabase = await serverClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: tokens.id_token,
    access_token: tokens.access_token ?? undefined,
  });
  if (error || !data.user) {
    console.error('[auth] Supabase rejected the Google ID token:', error?.message);
    return fail('Sign-in could not be completed. Please try again.');
  }

  // Google returns a refresh token on consent (prompt=consent asks every time);
  // an absent value must still not overwrite what we already hold.
  if (tokens.refresh_token) {
    try {
      await adminClient()
        .from('profiles')
        .upsert(
          {
            id: data.user.id,
            email: data.user.email ?? '',
            full_name: (data.user.user_metadata?.full_name as string) ?? '',
            google_refresh_token_enc: encryptSecret(tokens.refresh_token),
          },
          { onConflict: 'id' },
        );
    } catch (caught) {
      // Sign-in still succeeds; the app will report Gmail as not connected.
      console.error('[auth] could not store Google credentials:', caught);
    }
  }

  return finish('/app');
}
