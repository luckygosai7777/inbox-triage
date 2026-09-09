/**
 * OAuth callback.
 *
 * Supabase validates the Google exchange and issues the session. The only extra
 * work here is capturing the Google *refresh* token — Supabase hands it back
 * once, on the first consent — encrypting it, and storing it so background sync
 * can reach Gmail later without the user present.
 *
 * The redirect target is derived from our own origin, never from a query
 * parameter, so this cannot be turned into an open redirect.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { encryptSecret } from '@/lib/crypto';
import { adminClient, serverClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const oauthError = request.nextUrl.searchParams.get('error_description');
  const origin = request.nextUrl.origin;

  if (oauthError) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await serverClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session || !data.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error?.message ?? 'exchange_failed')}`,
    );
  }

  // Persist Google's refresh token, encrypted. It is only present on the first
  // consent; on later sign-ins Supabase returns none, so an absent value must
  // not overwrite what we already hold.
  const refreshToken = (data.session as any).provider_refresh_token as string | undefined;
  if (refreshToken) {
    try {
      const db = adminClient();
      await db
        .from('profiles')
        .upsert(
          {
            id: data.user.id,
            email: data.user.email ?? '',
            full_name: (data.user.user_metadata?.full_name as string) ?? '',
            google_refresh_token_enc: encryptSecret(refreshToken),
          },
          { onConflict: 'id' },
        );
    } catch (caught) {
      // Sign-in still succeeds; the app will report Gmail as not connected.
      console.error('[auth] could not store Google credentials:', caught);
    }
  }

  return NextResponse.redirect(`${origin}/app`);
}
