import { describe, expect, it } from 'vitest';

import { involvesClient, ownsRows, toTeamMessage, withBackoff } from '@/lib/teams/sync';

const ORG = ['getowed.online'];
const b64 = (s: string) => Buffer.from(s).toString('base64url');

const raw = (headers: Record<string, string>, body = 'Hello') => ({
  id: 'g1',
  threadId: 't1',
  internalDate: String(Date.UTC(2026, 10, 11, 10)),
  payload: {
    mimeType: 'text/plain',
    headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
    body: { data: b64(body) },
  },
});

describe('toTeamMessage', () => {
  it('keeps the RFC 822 ids and lower-cases addresses', () => {
    const parsed = toTeamMessage(
      raw({
        From: 'Maya <Maya@Acme.com>',
        To: 'Lucky@GetOwed.online',
        Cc: 'priya@getowed.online',
        'Message-ID': '<m2@acme.com>',
        References: '<root@acme.com> <m1@getowed.online>',
        Date: 'Wed, 11 Nov 2026 10:00:00 +0000',
      }),
      'mb1',
    );
    expect(parsed.messageId).toBe('<m2@acme.com>');
    expect(parsed.threadKey).toBe('<root@acme.com>');
    expect(parsed.msg.fromEmail).toBe('maya@acme.com');
    expect(parsed.msg.toEmails).toEqual(['lucky@getowed.online']);
    expect(parsed.msg.ccEmails).toEqual(['priya@getowed.online']);
  });

  it('falls back to a per-mailbox id when Message-ID is missing', () => {
    const parsed = toTeamMessage(raw({ From: 'a@acme.com', To: 'b@getowed.online' }), 'mb1');
    expect(parsed.messageId).toBe('<gmail-mb1-g1>');
    expect(parsed.threadKey).toBe('<gmail-mb1-t1>');
  });
});

const base = {
  fromName: '',
  ccEmails: [] as string[],
  sentAt: new Date(),
  body: '',
  senderKind: 'person' as const,
  isListMail: false,
};

describe('involvesClient', () => {
  it('is true when anyone is outside the org, false for internal-only mail', () => {
    expect(involvesClient({ ...base, fromEmail: 'a@getowed.online', toEmails: ['m@acme.com'] }, ORG)).toBe(true);
    expect(involvesClient({ ...base, fromEmail: 'a@getowed.online', toEmails: ['b@getowed.online'] }, ORG)).toBe(false);
  });
});

describe('ownsRows', () => {
  it("files our promise only under the promiser's own mailbox", () => {
    const priyaPromise = { ...base, fromEmail: 'priya@getowed.online', toEmails: ['m@acme.com'], ccEmails: ['lucky@getowed.online'] };
    expect(ownsRows(priyaPromise, 'priya@getowed.online', ORG)).toBe(true);
    expect(ownsRows(priyaPromise, 'lucky@getowed.online', ORG)).toBe(false);
  });

  it("files a client's mail only under a mailbox it was addressed To", () => {
    const clientMail = { ...base, fromEmail: 'm@acme.com', toEmails: ['ravi@getowed.online'], ccEmails: ['lucky@getowed.online'] };
    expect(ownsRows(clientMail, 'ravi@getowed.online', ORG)).toBe(true);
    expect(ownsRows(clientMail, 'lucky@getowed.online', ORG)).toBe(false);
  });
});

describe('withBackoff', () => {
  const noSleep = async () => {};

  it('retries rate limits and transient errors, then succeeds', async () => {
    let calls = 0;
    const result = await withBackoff(async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error('rate'), { code: 429 });
      return 'ok';
    }, 4, 1, noSleep);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry a permanent error', async () => {
    let calls = 0;
    await expect(
      withBackoff(async () => {
        calls++;
        throw Object.assign(new Error('nope'), { code: 403 });
      }, 4, 1, noSleep),
    ).rejects.toThrow('nope');
    expect(calls).toBe(1);
  });

  it('gives up after the last try', async () => {
    let calls = 0;
    await expect(
      withBackoff(async () => {
        calls++;
        throw Object.assign(new Error('busy'), { code: 503 });
      }, 3, 1, noSleep),
    ).rejects.toThrow('busy');
    expect(calls).toBe(3);
  });
});
