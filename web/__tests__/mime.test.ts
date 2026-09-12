/**
 * The message envelope.
 *
 * Nothing here talks to Gmail, and that is the point: a malformed message is
 * not an exception, it is an email that lands in a client's inbox looking
 * broken, and you find out from the client.
 */
import { describe, expect, it } from 'vitest';

import {
  buildMimeMessage,
  encodeHeaderValue,
  formatAddress,
  isEmailish,
  parseRecipients,
  toBase64Url,
} from '@/lib/mime';

const BASE = {
  to: ['maya@northline.co'],
  subject: 'Re: Contract redline',
  body: 'Thursday works. I will send the deck tonight.',
  fromEmail: 'lucky@owed.app',
  fromName: 'Lucky Gosai',
};

describe('encodeHeaderValue', () => {
  it('leaves plain ASCII alone', () => {
    expect(encodeHeaderValue('Re: Contract redline')).toBe('Re: Contract redline');
  });

  it('encodes non-ASCII, which headers cannot carry', () => {
    expect(encodeHeaderValue('José')).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
  });

  it('splits a long value into several encoded words', () => {
    // One encoded word is capped at 75 chars and some servers enforce it.
    const out = encodeHeaderValue('जरूरी '.repeat(20));
    expect(out.split(' ').length).toBeGreaterThan(1);
    for (const word of out.split(' ')) expect(word.length).toBeLessThanOrEqual(75);
  });
});

describe('formatAddress', () => {
  it('formats a plain name', () => {
    expect(formatAddress('a@b.com', 'Maya Okonkwo')).toBe('Maya Okonkwo <a@b.com>');
  });

  it('quotes a name containing a comma, which would otherwise split the header', () => {
    expect(formatAddress('a@b.com', 'Okonkwo, Maya')).toBe('"Okonkwo, Maya" <a@b.com>');
  });

  it('encodes a non-ASCII name', () => {
    expect(formatAddress('a@b.com', 'José')).toMatch(/^=\?UTF-8\?B\?.+\?= <a@b\.com>$/);
  });

  it('omits an empty name', () => {
    expect(formatAddress('a@b.com', '')).toBe('a@b.com');
  });
});

describe('buildMimeMessage', () => {
  it('threads the reply for clients that are not Gmail', () => {
    // Gmail's threadId only groups it in the SENDER's mailbox. These two
    // headers are what make it thread on the recipient's side.
    const raw = buildMimeMessage({
      ...BASE,
      inReplyTo: '<abc@mail.gmail.com>',
      references: '<start@mail.gmail.com>',
    });
    expect(raw).toContain('In-Reply-To: <abc@mail.gmail.com>');
    expect(raw).toContain('References: <start@mail.gmail.com> <abc@mail.gmail.com>');
  });

  it('starts the References chain when there is not one yet', () => {
    const raw = buildMimeMessage({ ...BASE, inReplyTo: '<abc@x>' });
    expect(raw).toContain('References: <abc@x>');
  });

  it('refuses a forged header smuggled through a subject', () => {
    const raw = buildMimeMessage({
      ...BASE,
      subject: 'Hello\r\nBcc: attacker@evil.test',
    });
    expect(raw).not.toMatch(/^Bcc: attacker@evil\.test/m);
  });

  it('sends plain and HTML together', () => {
    const raw = buildMimeMessage(BASE);
    expect(raw).toContain('multipart/alternative');
    expect(raw).toContain('text/plain; charset="UTF-8"');
    expect(raw).toContain('text/html; charset="UTF-8"');
  });

  it('does not nest multipart/mixed when there is nothing to attach', () => {
    // An extra wrapper renders badly in older clients.
    expect(buildMimeMessage(BASE)).not.toContain('multipart/mixed');
  });

  it('wraps in multipart/mixed once a file is attached', () => {
    const raw = buildMimeMessage({
      ...BASE,
      attachments: [
        { filename: 'brief.pdf', mimeType: 'application/pdf', base64: 'AAAA' },
      ],
    });
    expect(raw).toContain('multipart/mixed');
    expect(raw).toContain('Content-Disposition: attachment; filename="brief.pdf"');
    expect(raw).toContain('application/pdf');
  });

  it('encodes an attachment filename that is not ASCII', () => {
    const raw = buildMimeMessage({
      ...BASE,
      attachments: [{ filename: 'अनुबंध.pdf', mimeType: 'application/pdf', base64: 'AA' }],
    });
    expect(raw).toMatch(/filename="=\?UTF-8\?B\?.+\?="/);
  });

  it('wraps base64 bodies at 76 characters', () => {
    const raw = buildMimeMessage({ ...BASE, body: 'x'.repeat(500) });
    for (const line of raw.split('\r\n')) expect(line.length).toBeLessThanOrEqual(998);
  });

  it('keeps a unicode body intact through base64', () => {
    const body = 'नमस्ते — deck आ रहा है';
    const raw = buildMimeMessage({ ...BASE, body });
    const encoded = Buffer.from(body, 'utf8').toString('base64');
    expect(raw.replace(/\r\n/g, '')).toContain(encoded.replace(/\r\n/g, ''));
  });
});

describe('toBase64Url', () => {
  it('uses the URL-safe alphabet with no padding', () => {
    const out = toBase64Url('a>b?c~d\u00ff\u00fe');
    expect(out).not.toMatch(/[+/=]/);
  });
});

describe('parseRecipients', () => {
  it('reads commas, semicolons and newlines', () => {
    expect(parseRecipients('a@b.com, c@d.com; e@f.com\ng@h.com')).toEqual([
      'a@b.com', 'c@d.com', 'e@f.com', 'g@h.com',
    ]);
  });

  it('pulls the address out of a display name', () => {
    expect(parseRecipients('Maya Okonkwo <maya@northline.co>')).toEqual(['maya@northline.co']);
  });

  it('drops duplicates', () => {
    expect(parseRecipients('a@b.com, a@b.com')).toEqual(['a@b.com']);
  });

  it('returns nothing for empty input', () => {
    expect(parseRecipients('  ,  ; ')).toEqual([]);
  });
});

describe('isEmailish', () => {
  it('accepts ordinary addresses', () => {
    expect(isEmailish('a.b+tag@sub.example.co.in')).toBe(true);
  });

  it('rejects obvious rubbish', () => {
    for (const bad of ['', 'no-at-sign', 'a@b', 'a@@b.com', 'a b@c.com']) {
      expect(isEmailish(bad), bad).toBe(false);
    }
  });
});
