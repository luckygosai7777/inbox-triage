import { describe, expect, it } from 'vitest';

import { extractCommitmentsHeuristic, type Commitment } from '@/lib/commitments';
import { quotedFrom, rowsFromMessage, type Extractor, type TeamMessage } from '@/lib/teams/extract';

const ORG = ['getowed.online'];
const heuristic: Extractor = async ({ body, direction, counterparty, counterpartyEmail, now }) =>
  extractCommitmentsHeuristic(body, { direction, counterparty, counterpartyEmail, now });

// Wednesday 11 November 2026, so "by Friday" must mean the 13th.
const sentAt = new Date(2026, 10, 11, 10, 0);

const msg = (over: Partial<TeamMessage>): TeamMessage => ({
  fromEmail: 'lucky@getowed.online',
  fromName: 'Lucky',
  toEmails: ['maya@acme.com'],
  ccEmails: [],
  sentAt,
  body: '',
  senderKind: 'person',
  isListMail: false,
  ...over,
});

describe('rowsFromMessage', () => {
  it('turns our promise to a client into we_owe, keyed to the client, dated from the sent date', async () => {
    const rows = await rowsFromMessage(
      msg({ body: "Hi Maya,\n\nI'll send the revised deck by Friday.\n\nThanks" }),
      ORG,
      heuristic,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ direction: 'we_owe', clientKey: 'acme.com', clientName: 'Acme' });
    expect(rows[0].sourceQuote).toContain("I'll send the revised deck by Friday");
    expect(rows[0].deadline?.getDate()).toBe(13);
    expect(rows[0].deadlinePhrase).not.toBe('');
  });

  it('never invents a deadline the text does not give', async () => {
    const rows = await rowsFromMessage(msg({ body: "I'll review the scope doc and get back to you." }), ORG, heuristic);
    expect(rows[0].deadline).toBeNull();
    expect(rows[0].confidence).toBe('low');
  });

  it('skips internal-only threads', async () => {
    const rows = await rowsFromMessage(
      msg({ toEmails: ['priya@getowed.online'], body: "I'll send the deck by Friday." }),
      ORG,
      heuristic,
    );
    expect(rows).toEqual([]);
  });

  it("reads a client's promise as they_owe and their ask as unanswered_ask", async () => {
    const rows = await rowsFromMessage(
      msg({
        fromEmail: 'tom@acme.com',
        fromName: 'Tom Bekele',
        toEmails: ['lucky@getowed.online'],
        body: "I'll send the signed contract tomorrow. Could you send the invoice by Monday?",
      }),
      ORG,
      heuristic,
    );
    expect(rows.map((r) => r.direction).sort()).toEqual(['they_owe', 'unanswered_ask']);
    expect(rows.every((r) => r.clientKey === 'acme.com')).toBe(true);
  });

  it('ignores automated and list senders', async () => {
    const body = 'Could you confirm your details by Friday?';
    const from = { fromEmail: 'no-reply@acme.com', toEmails: ['lucky@getowed.online'], body };
    expect(await rowsFromMessage(msg({ ...from, senderKind: 'automated' }), ORG, heuristic)).toEqual([]);
    expect(await rowsFromMessage(msg({ ...from, isListMail: true }), ORG, heuristic)).toEqual([]);
  });

  it('drops a model row whose quote is not in the message (quote or nothing)', async () => {
    const paraphrase: Extractor = async ({ counterpartyEmail }) => [
      {
        direction: 'owed',
        what: 'Send the deck',
        counterparty: '',
        counterpartyEmail,
        evidence: 'I promised to send over the deck soon.', // not what was written
        dueAt: null,
        dueText: '',
        confidence: 'low',
      } satisfies Commitment,
    ];
    expect(await rowsFromMessage(msg({ body: "I'll send the deck by Friday." }), ORG, paraphrase)).toEqual([]);
  });
});

describe('quotedFrom', () => {
  it('tolerates whitespace and curly quotes, nothing else', () => {
    expect(quotedFrom('I’ll send   the deck', "Hi,\nI'll send\nthe deck by Friday")).toBe(true);
    expect(quotedFrom("I'll send the slides", "I'll send the deck")).toBe(false);
    expect(quotedFrom('   ', 'anything')).toBe(false);
  });
});
