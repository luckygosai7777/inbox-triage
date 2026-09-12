/**
 * A real email that the app got wrong, kept as a test.
 *
 * A person wrote, from a Gmail address never written to before:
 *
 *   "Dont forget me to send your gmail website code"
 *
 * It is a stranger, it is misspelt, it contains no question mark and no polite
 * question form — and it is exactly the kind of mail this product exists to
 * catch. It failed three ways at once: filed as Other, marked as needing no
 * reply, and missing from the Ledger.
 *
 * The lesson behind the fix: an ask is not always a question. "Send me the
 * file" is a stronger ask than "could you possibly send the file?", and the
 * first contact from a new client is by definition from someone you have
 * never written to.
 */
import { describe, expect, it } from 'vitest';

import { heuristicClassify, type ClassifyInput } from '@/lib/llm';
import { extractCommitmentsHeuristic } from '@/lib/commitments';

const REAL_EMAIL: ClassifyInput = {
  id: 'real-1',
  fromName: 'Lucky',
  fromEmail: 'someone.else@gmail.com',
  subject: 'Website code',
  preview: 'Dont forget me to send your gmail website code',
  body: 'Dont forget me to send your gmail website code',
  senderKind: 'person',
  hasCorresponded: false,
};

describe('first contact from a real person', () => {
  it('is not filed as Other', () => {
    expect(heuristicClassify(REAL_EMAIL).category).toBe('Clients');
  });

  it('needs a reply, even with no question mark', () => {
    expect(heuristicClassify(REAL_EMAIL).needsReply).toBe(true);
  });

  it('reaches the Ledger as something they are waiting on', () => {
    const found = extractCommitmentsHeuristic(REAL_EMAIL.body!, {
      direction: 'awaiting',
      counterparty: 'Lucky',
      counterpartyEmail: REAL_EMAIL.fromEmail,
    });
    expect(found.length).toBeGreaterThan(0);
  });
});

describe('imperative asks are asks', () => {
  const asks = [
    'Send me the invoice when you get a chance.',
    "Don't forget to share the deck.",
    'I need the final files by Tuesday.',
    'Please push the code to the repo.',
    'Looking forward to your reply.',
    'Get back to me on the pricing.',
    'Remind me to sign the contract.',
  ];

  for (const text of asks) {
    it(`treats "${text.slice(0, 34)}…" as needing a reply`, () => {
      const row = heuristicClassify({ ...REAL_EMAIL, preview: text, body: text });
      expect(row.needsReply).toBe(true);
    });
  }
});

describe('and still does not invent clients', () => {
  it('leaves a machine alone however demanding it sounds', () => {
    const row = heuristicClassify({
      ...REAL_EMAIL,
      senderKind: 'automated',
      fromEmail: 'no-reply@accounts.google.com',
      preview: 'Please send confirmation immediately. Do not forget.',
      body: 'Please send confirmation immediately. Do not forget.',
    });
    expect(row.category).toBe('Notifications');
    expect(row.needsReply).toBe(false);
  });

  it('keeps chat with no ask in it out of Clients', () => {
    const row = heuristicClassify({
      ...REAL_EMAIL,
      fromEmail: 'mum@gmail.com',
      subject: 'photos',
      preview: 'Here are the photos from Sunday. Was lovely to see you.',
      body: 'Here are the photos from Sunday. Was lovely to see you.',
    });
    expect(row.category).not.toBe('Clients');
  });
});
