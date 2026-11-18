/**
 * The app-run Google sign-in: PKCE, the state check, and what Google is asked for.
 */
import { describe, expect, it } from 'vitest';

import { authUrl, GOOGLE_SCOPES, newAttempt, pkceChallenge, readAttempt } from '@/lib/oauth';

describe('pkceChallenge', () => {
  it('matches the RFC 7636 appendix B example', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('readAttempt', () => {
  const attempt = newAttempt();

  it('returns the verifier when state matches', () => {
    expect(readAttempt(attempt.cookie, attempt.state)).toBe(attempt.verifier);
  });

  it('refuses a state this browser was not given', () => {
    expect(readAttempt(attempt.cookie, newAttempt().state)).toBeNull();
  });

  it('refuses when the cookie or state is missing or malformed', () => {
    expect(readAttempt(undefined, attempt.state)).toBeNull();
    expect(readAttempt(attempt.cookie, null)).toBeNull();
    expect(readAttempt('no-separator', 'no-separator')).toBeNull();
    expect(readAttempt(`${attempt.state}.`, attempt.state)).toBeNull();
    expect(readAttempt(`.${attempt.verifier}`, '')).toBeNull();
  });

  it('mints a different state every time', () => {
    expect(newAttempt().state).not.toBe(newAttempt().state);
  });
});

describe('authUrl', () => {
  const url = new URL(authUrl('client-123', 'https://www.getowed.online', 'state-abc', 'verifier-xyz'));
  const q = url.searchParams;

  it('sends Google back to our own domain, never supabase.co', () => {
    expect(url.origin).toBe('https://accounts.google.com');
    expect(q.get('redirect_uri')).toBe('https://www.getowed.online/auth/callback');
  });

  it('asks for read + send, not gmail.modify', () => {
    const scopes = q.get('scope')!.split(' ');
    expect(scopes).toEqual(GOOGLE_SCOPES);
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.readonly');
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.send');
    expect(scopes.some((s) => s.endsWith('gmail.modify'))).toBe(false);
  });

  it('requests a refresh token and binds the flow with state and PKCE', () => {
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('prompt')).toBe('consent');
    expect(q.get('state')).toBe('state-abc');
    expect(q.get('code_challenge')).toBe(pkceChallenge('verifier-xyz'));
    expect(q.get('code_challenge_method')).toBe('S256');
  });
});
