import { describe, expect, it } from 'vitest';

import {
  extractBodyText,
  extractDeadline,
  hasAttachment,
  looksLikeListMail,
  parseListUnsubscribe,
  splitAddress,
  splitAddressList,
  stripQuoted,
} from '@/lib/parsing';

// A Wednesday, so weekday arithmetic is unambiguous.
const NOW = new Date(2026, 8, 2, 9, 0, 0);

describe('splitAddress', () => {
  it('reads a named address', () => {
    expect(splitAddress('Maya Okonkwo <maya.okonkwo@northline.co>')).toEqual({
      name: 'Maya Okonkwo',
      email: 'maya.okonkwo@northline.co',
    });
  });

  it('derives a name from a bare address', () => {
    expect(splitAddress('priya.raman@ramanstudio.in')).toEqual({
      name: 'Priya Raman',
      email: 'priya.raman@ramanstudio.in',
    });
  });

  it('lowercases the address', () => {
    expect(splitAddress('<Billing@Figma.COM>').email).toBe('billing@figma.com');
  });

  it('parses a list', () => {
    expect(splitAddressList('A <a@x.co>, b@y.co')).toEqual(['a@x.co', 'b@y.co']);
    expect(splitAddressList('')).toEqual([]);
  });
});

describe('extractDeadline', () => {
  it('treats an explicit time today as high confidence', () => {
    const result = extractDeadline('Section 4 needs your signature before 6pm today.', NOW);
    expect(result.matched).toBe(true);
    expect(result.confidence).toBe('high');
    expect(result.dueAt?.getHours()).toBe(18);
    expect(result.dueAt?.getDate()).toBe(NOW.getDate());
    expect(result.evidence).toContain('Section 4');
  });

  it('resolves "by Friday" forward', () => {
    const result = extractDeadline('Need an answer by Friday.', NOW);
    expect(result.matched).toBe(true);
    expect(result.dueAt!.getDay()).toBe(5);
    expect(result.dueAt!.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('rolls the same weekday to next week', () => {
    const result = extractDeadline('Get it to me by Wednesday.', NOW);
    const days = Math.round((result.dueAt!.getTime() - NOW.getTime()) / 86400000);
    expect(days).toBe(7);
  });

  it('handles end of day', () => {
    expect(extractDeadline('Please send by end of day.', NOW).dueAt?.getHours()).toBe(18);
  });

  it('handles tomorrow', () => {
    const result = extractDeadline('I need it by tomorrow.', NOW);
    expect(result.dueAt!.getDate()).toBe(NOW.getDate() + 1);
  });

  it('converts am/pm', () => {
    expect(extractDeadline('by 9am today', NOW).dueAt?.getHours()).toBe(9);
    expect(extractDeadline('by 3pm today', NOW).dueAt?.getHours()).toBe(15);
  });

  it('refuses to invent a deadline from a vague follow-up', () => {
    const result = extractDeadline(
      "Following up on the March retainer - let me know if it's stuck.",
      NOW,
    );
    expect(result.matched).toBe(false);
    expect(result.confidence).toBe('low');
    expect(result.dueAt).toBeNull();
  });

  it('rejects a nonsense hour', () => {
    expect(extractDeadline('by 47 today', NOW).matched).toBe(false);
  });

  it('keeps only the sentence as evidence, not the whole body', () => {
    const body = 'Hi there. Section 4 needs your signature before 6pm today. Thanks!';
    expect(extractDeadline(body, NOW).evidence).toBe(
      'Section 4 needs your signature before 6pm today.',
    );
  });
});

describe('stripQuoted', () => {
  it('drops quoted history', () => {
    const body = "I'll send the deck Friday.\n\nOn Mon, Bob wrote:\n> earlier stuff";
    expect(stripQuoted(body)).toBe("I'll send the deck Friday.");
  });

  it('drops a signature block', () => {
    expect(stripQuoted('Real content here.\n--\nJordan Diaz\nCEO')).toBe('Real content here.');
  });

  it('drops > quoted lines', () => {
    expect(stripQuoted('My reply.\n> their text')).toBe('My reply.');
  });

  it('leaves a clean body alone', () => {
    expect(stripQuoted('Just one line.')).toBe('Just one line.');
  });
});

describe('bodies', () => {
  const encode = (text: string) => Buffer.from(text).toString('base64url');

  it('prefers plain text over html', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: encode('plain body') } },
        { mimeType: 'text/html', body: { data: encode('<p>html body</p>') } },
      ],
    };
    expect(extractBodyText(payload)).toBe('plain body');
  });

  it('falls back to stripped html', () => {
    const payload = {
      mimeType: 'text/html',
      body: { data: encode('<p>hello <b>there</b></p>') },
    };
    expect(extractBodyText(payload)).toBe('hello there');
  });

  it('detects attachments', () => {
    expect(
      hasAttachment({
        parts: [
          { filename: '', body: {} },
          { filename: 'resume.pdf', body: { attachmentId: 'abc' } },
        ],
      }),
    ).toBe(true);
    expect(hasAttachment({ parts: [{ filename: '', body: {} }] })).toBe(false);
  });
});

describe('list headers', () => {
  it('parses both unsubscribe targets', () => {
    const parsed = parseListUnsubscribe(
      '<mailto:unsub@list.co?subject=stop>, <https://list.co/unsub/abc>',
    );
    expect(parsed.mailto).toBe('unsub@list.co');
    expect(parsed.url).toBe('https://list.co/unsub/abc');
  });

  it('handles an empty header', () => {
    expect(parseListUnsubscribe('')).toEqual({});
  });

  it('detects list mail', () => {
    expect(looksLikeListMail({ 'list-unsubscribe': '<mailto:x@y.co>' })).toBe(true);
    expect(looksLikeListMail({ precedence: 'bulk' })).toBe(true);
    expect(looksLikeListMail({ from: 'a@b.co' })).toBe(false);
  });
});
