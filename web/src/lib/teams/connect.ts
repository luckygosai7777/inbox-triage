/**
 * After a Teams sign-in: put the person in their org and connect their mailbox.
 *
 * The org is chosen by the Google ID token's `hd` claim, the Workspace domain
 * Google itself vouches for, never by the email's spelling. Consumer accounts
 * (no hd) are refused: Owed for Teams is for Workspace companies.
 *
 * shortcut: the first person to sign in from a domain becomes its admin. Fine
 * for an Internal app and hand-picked pilots; before open sign-up, require the
 * Workspace admin (Admin SDK) or an invite instead.
 */
import 'server-only';

import { encryptSecret } from '@/lib/crypto';
import { adminClient } from '@/lib/supabase';

import { audit } from './context';

/** The Workspace domain in a Google ID token, or '' for a consumer account. */
export function hostedDomain(idToken: string): string {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof payload.hd === 'string' ? payload.hd.toLowerCase() : '';
  } catch {
    return '';
  }
}

export class TeamsSignInError extends Error {}

export async function connectTeamMailbox(input: {
  userId: string;
  email: string;
  name: string;
  idToken: string;
  refreshToken: string | null | undefined;
}): Promise<void> {
  const domain = hostedDomain(input.idToken);
  if (!domain) throw new TeamsSignInError('Owed for Teams needs a Google Workspace account, not a personal Gmail.');
  // It goes into a PostgREST filter below; a domain has no reason to hold anything else.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new TeamsSignInError('Unrecognised Workspace domain.');
  const email = input.email.toLowerCase();
  const db = adminClient() as any;

  let { data: org } = await db
    .from('orgs')
    .select('id')
    .or(`primary_domain.eq.${domain},extra_domains.cs.{${domain}}`)
    .maybeSingle();
  let role: 'admin' | 'member' = 'member';
  if (!org) {
    ({ data: org } = await db
      .from('orgs')
      .insert({ name: domain.split('.')[0], primary_domain: domain })
      .select('id')
      .single());
    role = 'admin';
  }

  const { data: existing } = await db
    .from('members')
    .select('id, status')
    .eq('org_id', org.id)
    .eq('email', email)
    .maybeSingle();
  if (existing?.status === 'removed') throw new TeamsSignInError('Your access to this team was removed by an admin.');

  const { data: member } = await db
    .from('members')
    .upsert(
      { org_id: org.id, email, user_id: input.userId, name: input.name, status: 'active', ...(existing ? {} : { role }) },
      { onConflict: 'org_id,email' },
    )
    .select('id')
    .single();

  // prompt=consent returns a refresh token every time; without one there is nothing to sync with.
  if (!input.refreshToken) throw new TeamsSignInError('Google did not grant offline access. Please try again.');

  const { data: mailbox } = await db
    .from('mailboxes')
    .upsert(
      { org_id: org.id, member_id: member.id, email, sync_status: 'pending', sync_error: '' },
      { onConflict: 'org_id,email' },
    )
    .select('id')
    .single();
  await db
    .from('mailbox_tokens')
    .upsert(
      { mailbox_id: mailbox.id, refresh_token_enc: encryptSecret(input.refreshToken), updated_at: new Date().toISOString() },
      { onConflict: 'mailbox_id' },
    );
  await audit(org.id, member.id, 'mailbox_connected', email);
}
