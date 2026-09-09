import { describe, expect, it } from 'vitest';

import {
  composeDigest,
  digestIsDue,
  renderDigestHtml,
  renderDigestText,
  type DigestRow,
} from '@/lib/digest';

const NOW = new Date(2026, 8, 9, 8, 0, 0);
const hours = (n: number) => new Date(NOW.getTime() + n * 3600_000).toISOString();
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const row = (over: Partial<DigestRow> = {}): DigestRow => ({
  what: 'Send the revised deck',
  counterparty: 'Maya Okonkwo',
  direction: 'owed',
  dueAt: null,
  createdAt: days(-2),
  ...over,
});

describe('composeDigest — when to send at all', () => {
  it('stays silent when nothing is due, late or stale', () => {
    const digest = composeDigest([row({ dueAt: days(5) }), row({ dueAt: null, createdAt: days(-1) })], NOW);
    expect(digest.send).toBe(false);
    expect(digest.subject).toBe('');
  });

  it('stays silent on an empty ledger', () => {
    expect(composeDigest([], NOW).send).toBe(false);
  });

  it('sends when something is late', () => {
    expect(composeDigest([row({ dueAt: days(-1) })], NOW).send).toBe(true);
  });

  it('sends when something is due today', () => {
    expect(composeDigest([row({ dueAt: hours(6) })], NOW).send).toBe(true);
  });

  it('sends when an undated promise has been sitting a long time', () => {
    const digest = composeDigest([row({ dueAt: null, createdAt: days(-30) })], NOW);
    expect(digest.send).toBe(true);
    expect(digest.stale).toHaveLength(1);
  });

  it('does not treat a recent undated promise as stale', () => {
    expect(composeDigest([row({ dueAt: null, createdAt: days(-3) })], NOW).send).toBe(false);
  });
});

describe('composeDigest — the subject line', () => {
  it('names the person when exactly one thing is late', () => {
    const digest = composeDigest([row({ dueAt: days(-1), counterparty: 'Maya Okonkwo' })], NOW);
    expect(digest.subject).toBe('Late: Send the revised deck (Maya Okonkwo)');
  });

  it('counts when several are late', () => {
    const digest = composeDigest(
      [row({ dueAt: days(-3) }), row({ dueAt: days(-1) }), row({ dueAt: days(-2) })],
      NOW,
    );
    expect(digest.subject).toContain('3 things are late');
  });

  it('leads with lateness over things due today', () => {
    const digest = composeDigest([row({ dueAt: days(-1) }), row({ dueAt: hours(4) })], NOW);
    expect(digest.subject).toMatch(/^Late:/);
  });

  it('falls back to today when nothing is late', () => {
    const digest = composeDigest([row({ dueAt: hours(4) }), row({ dueAt: hours(6) })], NOW);
    expect(digest.subject).toBe('Due today: 2 things');
  });

  it('mentions ageing when that is all there is', () => {
    const digest = composeDigest([row({ dueAt: null, createdAt: days(-20) })], NOW);
    expect(digest.subject).toContain('sitting a while');
  });
});

describe('composeDigest — buckets', () => {
  it('separates late, today and stale', () => {
    const digest = composeDigest(
      [
        row({ what: 'late one', dueAt: days(-2) }),
        row({ what: 'today one', dueAt: hours(5) }),
        row({ what: 'old one', dueAt: null, createdAt: days(-40) }),
        row({ what: 'future one', dueAt: days(4) }),
      ],
      NOW,
    );
    expect(digest.overdue.map((r) => r.what)).toEqual(['late one']);
    expect(digest.today.map((r) => r.what)).toEqual(['today one']);
    expect(digest.stale.map((r) => r.what)).toEqual(['old one']);
    expect(digest.totalOpen).toBe(4);
  });

  it('shows the oldest stale items first, capped at three', () => {
    const rows = [15, 40, 25, 60, 20].map((age, i) =>
      row({ what: `item ${i}`, dueAt: null, createdAt: days(-age) }),
    );
    const digest = composeDigest(rows, NOW);
    expect(digest.stale).toHaveLength(3);
    expect(digest.stale[0].what).toBe('item 3'); // 60 days
  });

  it('caps a very long late list', () => {
    const rows = Array.from({ length: 25 }, (_, i) => row({ what: `x${i}`, dueAt: days(-2) }));
    expect(composeDigest(rows, NOW).overdue).toHaveLength(10);
  });
});

describe('rendering', () => {
  const digest = composeDigest(
    [row({ what: 'Send the deck', dueAt: days(-2), counterparty: 'Maya' })],
    NOW,
  );

  it('plain text carries the item and a link back', () => {
    const text = renderDigestText(digest, 'https://app.example.com', NOW);
    expect(text).toContain('Send the deck');
    expect(text).toContain('You told Maya you would');
    expect(text).toContain('https://app.example.com/app/ledger');
    expect(text).toContain('/app/settings'); // an unsubscribe path
  });

  it('html escapes user-supplied text', () => {
    const nasty = composeDigest(
      [row({ what: '<script>alert(1)</script>', dueAt: days(-1), counterparty: 'A & B' })],
      NOW,
    );
    const html = renderDigestHtml(nasty, 'https://app.example.com', NOW);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B');
  });

  it('html names how late something is', () => {
    const html = renderDigestHtml(digest, 'https://app.example.com', NOW);
    expect(html).toContain('2 days late');
  });
});

describe('digestIsDue', () => {
  const at = (hour: number) => new Date(Date.UTC(2026, 8, 9, hour, 0, 0));

  it('fires at the chosen hour in the user timezone', () => {
    const profile = { timezone: 'UTC', digest_hour: 8, last_digest_at: null };
    expect(digestIsDue(profile, at(8))).toBe(true);
    expect(digestIsDue(profile, at(9))).toBe(false);
  });

  it('respects a non-UTC timezone', () => {
    // 08:00 in Kolkata (UTC+5:30) is 02:30 UTC.
    const profile = { timezone: 'Asia/Kolkata', digest_hour: 8, last_digest_at: null };
    expect(digestIsDue(profile, new Date(Date.UTC(2026, 8, 9, 2, 30)))).toBe(true);
    expect(digestIsDue(profile, at(8))).toBe(false);
  });

  it('does not send twice in one day', () => {
    const profile = {
      timezone: 'UTC',
      digest_hour: 8,
      last_digest_at: new Date(Date.UTC(2026, 8, 9, 8, 0)).toISOString(),
    };
    expect(digestIsDue(profile, at(8))).toBe(false);
  });

  it('sends again the next day', () => {
    const profile = {
      timezone: 'UTC',
      digest_hour: 8,
      last_digest_at: new Date(Date.UTC(2026, 8, 8, 8, 0)).toISOString(),
    };
    expect(digestIsDue(profile, at(8))).toBe(true);
  });

  it('falls back to UTC rather than skipping on a bad timezone', () => {
    const profile = { timezone: 'Not/AZone', digest_hour: 8, last_digest_at: null };
    expect(digestIsDue(profile, at(8))).toBe(true);
  });
});
