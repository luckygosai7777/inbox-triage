import { describe, expect, it } from 'vitest';

import { authUrl, GOOGLE_SCOPES, isTeamsState, newAttempt, readAttempt, TEAMS_SCOPES } from '@/lib/oauth';
import { hostedDomain } from '@/lib/teams/connect';

const jwt = (payload: object) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;

describe('hostedDomain', () => {
  it('reads the Workspace domain Google vouches for', () => {
    expect(hostedDomain(jwt({ email: 'lucky@getowed.online', hd: 'GetOwed.online' }))).toBe('getowed.online');
  });

  it('is empty for a consumer account or a malformed token', () => {
    expect(hostedDomain(jwt({ email: 'someone@gmail.com' }))).toBe('');
    expect(hostedDomain('not-a-jwt')).toBe('');
  });
});

describe('the Teams sign-in flow', () => {
  it('marks its state, and the mark survives the cookie check', () => {
    const teams = newAttempt(true);
    expect(isTeamsState(teams.state)).toBe(true);
    expect(readAttempt(teams.cookie, teams.state)).toBe(teams.verifier);
    expect(isTeamsState(newAttempt().state)).toBe(false);
    expect(isTeamsState(null)).toBe(false);
  });

  it('asks for read + compose only: never send, never modify, no calendar', () => {
    const scope = new URL(authUrl('c', 'https://x.test', 's', 'v', TEAMS_SCOPES)).searchParams.get('scope')!;
    expect(scope).toContain('gmail.readonly');
    expect(scope).toContain('gmail.compose');
    expect(scope).not.toMatch(/gmail\.send|gmail\.modify|calendar|mail\.google\.com/);
  });

  it('leaves the personal flow on its own scopes', () => {
    const scope = new URL(authUrl('c', 'https://x.test', 's', 'v')).searchParams.get('scope');
    expect(scope).toBe(GOOGLE_SCOPES.join(' '));
  });
});
