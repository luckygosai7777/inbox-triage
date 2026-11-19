/**
 * The team Ledger's view of one message. Wraps the personal extractor
 * (lib/commitments.ts, lib/llm.ts) rather than replacing it, and adds what a
 * team needs: direction, client, and the external-only rule.
 *
 *   our side -> client   promises in it are `we_owe`
 *   client -> our side   promises in it are `they_owe`; asks are `unanswered_ask`
 *                        (whether anyone answered is decided per thread, later)
 *   internal-only, lists, automated senders   nothing
 *
 * Principles enforced here, not left to callers:
 *  - Quote or nothing: a row survives only if its quote appears verbatim in the
 *    message. A model that paraphrases loses the row (precision over recall).
 *  - Relative dates ("by Friday") resolve against the message's sent date, and
 *    only the local parser sets a deadline (inherited from the extractor).
 */
import type { Commitment, Direction } from '@/lib/commitments';
import { stripQuoted, type SenderKind } from '@/lib/parsing';

import { clientDisplayName, clientKey, isInternal } from './clients';

export type Extractor = (input: {
  body: string;
  direction: Direction;
  counterparty: string;
  counterpartyEmail: string;
  now: Date;
}) => Promise<Commitment[]>;

export type TeamMessage = {
  fromEmail: string;
  fromName: string;
  toEmails: string[];
  ccEmails: string[];
  sentAt: Date;
  body: string;
  senderKind: SenderKind;
  isListMail: boolean;
};

export type RowDirection = 'we_owe' | 'they_owe' | 'unanswered_ask';

export type RowCandidate = {
  direction: RowDirection;
  summary: string;
  sourceQuote: string;
  deadline: Date | null;
  deadlinePhrase: string;
  confidence: 'high' | 'low';
  clientKey: string;
  clientName: string;
};

const squash = (text: string) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

/** Is the quote really in the message the reader will be linked to? */
export function quotedFrom(quote: string, body: string): boolean {
  const q = squash(quote);
  return q.length > 0 && squash(body).includes(q);
}

export async function rowsFromMessage(
  msg: TeamMessage,
  orgDomains: string[],
  extract: Extractor,
): Promise<RowCandidate[]> {
  const body = stripQuoted(msg.body);
  const run = async (direction: Direction, as: RowDirection, counterparty: string, email: string) => {
    const found = await extract({ body, direction, counterparty, counterpartyEmail: email, now: msg.sentAt });
    return found
      .filter((c) => quotedFrom(c.evidence, body))
      .map<RowCandidate>((c) => ({
        direction: as,
        summary: c.what,
        sourceQuote: c.evidence,
        deadline: c.dueAt,
        deadlinePhrase: c.dueText,
        confidence: c.confidence,
        clientKey: clientKey(email),
        clientName: clientDisplayName(email, counterparty),
      }));
  };

  if (isInternal(msg.fromEmail, orgDomains)) {
    const client = [...msg.toEmails, ...msg.ccEmails].find((a) => a && !isInternal(a, orgDomains));
    if (!client) return []; // internal-only thread
    return run('owed', 'we_owe', '', client);
  }

  if (msg.senderKind !== 'person' || msg.isListMail) return [];
  const sender = msg.fromEmail;
  return [
    ...(await run('owed', 'they_owe', msg.fromName, sender)),
    ...(await run('awaiting', 'unanswered_ask', msg.fromName, sender)),
  ];
}
