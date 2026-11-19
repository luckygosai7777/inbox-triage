import { describe, expect, it } from 'vitest';

import { answeredSince, messageIdList, threadHeaders, threadKey } from '@/lib/teams/threads';

const root = '<root-1@mail.acme.com>';
const reply1 = '<r1@getowed.online>';
const reply2 = '<r2@mail.acme.com>';

describe('threadKey', () => {
  it('gives every message in one conversation the same key', () => {
    const first = threadHeaders({ 'message-id': root });
    const second = threadHeaders({ 'message-id': reply1, 'in-reply-to': root, references: root });
    const third = threadHeaders({
      'message-id': reply2,
      'in-reply-to': reply1,
      references: `${root}\r\n ${reply1}`,
    });
    expect(threadKey(first)).toBe(root);
    expect(threadKey(second)).toBe(root);
    expect(threadKey(third)).toBe(root);
  });

  it('falls back to In-Reply-To when References is missing', () => {
    expect(threadKey(threadHeaders({ 'message-id': reply1, 'in-reply-to': root }))).toBe(root);
  });

  it('is empty when the message has no ids at all (sync then uses a per-mailbox fallback)', () => {
    expect(threadKey(threadHeaders({}))).toBe('');
  });
});

describe('messageIdList', () => {
  it('reads folded, whitespace-separated ids and ignores junk', () => {
    expect(messageIdList(`${root}\r\n\t${reply1} garbage`)).toEqual([root, reply1]);
    expect(messageIdList(undefined)).toEqual([]);
  });
});

describe('answeredSince', () => {
  const askedAt = new Date('2026-11-10T10:00:00Z');

  it('is answered when any teammate wrote after the ask', () => {
    expect(
      answeredSince([{ fromInternal: true, sentAt: new Date('2026-11-10T12:00:00Z') }], askedAt),
    ).toBe(true);
  });

  it('is not answered by the client writing again, or by a teammate writing before', () => {
    expect(
      answeredSince(
        [
          { fromInternal: false, sentAt: new Date('2026-11-11T09:00:00Z') },
          { fromInternal: true, sentAt: new Date('2026-11-09T09:00:00Z') },
        ],
        askedAt,
      ),
    ).toBe(false);
  });
});
