/**
 * The Commitment Ledger.
 *
 * Every other inbox tool answers "what arrived?". This answers "what do I owe?"
 *
 * Two directions:
 *
 *   owed     — a promise the user made, extracted from their own SENT mail.
 *              "I'll send the deck by Friday" becomes a tracked obligation with
 *              the sentence kept as proof.
 *   awaiting — someone asked the user for something and no reply was ever sent.
 *              Detected structurally: an inbound message in a thread whose most
 *              recent message is still inbound.
 *
 * Why this is hard to fake and hard to copy: it requires reading sent mail,
 * distinguishing a commitment ("I'll review it tonight") from a pleasantry
 * ("I'll be in touch"), and resolving whether a later message settled it.
 * Boomerang only nags when nobody replies to *you*. Nothing tracks what you
 * promised.
 *
 * Confidence discipline, same as the VIP brief: the local date parser is the
 * only thing that may set a due date. The model proposes the obligation and
 * quotes the sentence; it never invents a deadline.
 */
import {
  extractDeadline,
  sentences,
  stripQuoted,
  type Deadline,
} from './parsing';

export type Direction = 'owed' | 'awaiting';

export type Commitment = {
  direction: Direction;
  what: string;
  counterparty: string;
  counterpartyEmail: string;
  evidence: string;
  dueAt: Date | null;
  dueText: string;
  confidence: 'high' | 'low';
};

/**
 * Phrases that signal a real commitment, as opposed to a courtesy.
 *
 * Deliberately narrow. A ledger that fills with "thanks, I'll take a look"
 * teaches people to ignore it, so the bar is a first-person future action.
 */
const PROMISE_PATTERNS: RegExp[] = [
  /\bI(?:'| a)?ll\s+(?:send|share|get|have|put|draft|write|review|look|come back|revert|follow up|circle back|update|confirm|check|prepare|finish|deliver|ship|call|email|forward|sort|fix|add|book|schedule)\b/i,
  /\bI\s+will\s+(?:send|share|get|have|put|draft|write|review|look|revert|follow up|update|confirm|check|prepare|finish|deliver|ship|call|email|forward|sort|fix|add|book|schedule)\b/i,
  /\b(?:let me|I can)\s+(?:send|share|get|put|draft|write|review|check|confirm|prepare|look)\b.{0,40}\b(?:by|before|today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday)\b/i,
  /\bI'?m\s+(?:going to|gonna)\s+\w+/i,
  /\bwe'?ll\s+(?:send|share|get|have|deliver|ship|confirm|revert|follow up)\b/i,
  /\byou'?ll\s+have\s+(?:it|this|them)\b/i,
  /\bconsider\s+it\s+done\b/i,
];

/** Vague courtesies that look like promises but commit to nothing actionable. */
const HEDGE_PATTERNS: RegExp[] = [
  /\bI'?ll\s+be\s+in\s+touch\b/i,
  /\bI'?ll\s+let\s+you\s+know\s+if\b/i,
  /\bI'?ll\s+(?:try|see|think)\b/i,
  /\bif\s+(?:I|we)\s+(?:can|get)\b/i,
  /\bno\s+promises\b/i,
];

/** Questions and requests that put the ball in the user's court. */
const ASK_PATTERNS: RegExp[] = [
  /\b(?:could|can|would|will)\s+you\b/i,
  /\bplease\s+(?:send|share|confirm|review|sign|approve|let me know|advise|update)\b/i,
  /\bcan\s+we\s+(?:get|lock|confirm|schedule|move)\b/i,
  /\bany\s+(?:update|thoughts|chance)\b/i,
  /\blet\s+me\s+know\b/i,
  /\bwaiting\s+(?:on|for)\s+(?:you|your)\b/i,
  /\bwhen\s+(?:can|will|do)\s+you\b/i,
  /\bneed\s+(?:your|an answer|a decision|sign-?off)\b/i,
];

const MAX_WHAT = 120;

function tidy(sentence: string): string {
  const clean = sentence.replace(/\s+/g, ' ').trim().replace(/^[-*•>\s]+/, '');
  if (clean.length <= MAX_WHAT) return clean;
  return `${clean.slice(0, MAX_WHAT - 1).trimEnd()}…`;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Heuristic extraction. Runs with no model, and is the fallback whenever the
 * model is unavailable or declines, so the Ledger degrades rather than empties.
 */
export function extractCommitmentsHeuristic(
  body: string,
  options: {
    direction: Direction;
    counterparty: string;
    counterpartyEmail: string;
    now?: Date;
  },
): Commitment[] {
  const now = options.now ?? new Date();
  const patterns = options.direction === 'owed' ? PROMISE_PATTERNS : ASK_PATTERNS;
  const found: Commitment[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences(stripQuoted(body))) {
    if (sentence.length < 8 || sentence.length > 400) continue;
    if (!matchesAny(sentence, patterns)) continue;
    if (options.direction === 'owed' && matchesAny(sentence, HEDGE_PATTERNS)) continue;

    const what = tidy(sentence);
    const key = what.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const deadline = extractDeadline(sentence, now);
    found.push({
      direction: options.direction,
      what,
      counterparty: options.counterparty,
      counterpartyEmail: options.counterpartyEmail,
      evidence: sentence.slice(0, 300),
      dueAt: deadline.dueAt,
      dueText: deadline.matched ? deadline.text : '',
      confidence: deadline.matched ? 'high' : 'low',
    });

    if (found.length >= 3) break; // one message rarely carries more than a few
  }

  return found;
}

/**
 * Applies the confidence rule to a model-proposed commitment.
 *
 * The model supplies `what` and the sentence it read. The date is re-derived
 * locally from that sentence: if the parser cannot pin it down, the commitment
 * is stored with no due date rather than a guessed one.
 */
export function reconcileCommitment(
  proposed: { what: string; evidence: string },
  options: { direction: Direction; counterparty: string; counterpartyEmail: string; now?: Date },
): Commitment {
  const deadline: Deadline = extractDeadline(proposed.evidence, options.now ?? new Date());
  return {
    direction: options.direction,
    what: tidy(proposed.what),
    counterparty: options.counterparty,
    counterpartyEmail: options.counterpartyEmail,
    evidence: proposed.evidence.slice(0, 300),
    dueAt: deadline.dueAt,
    dueText: deadline.matched ? deadline.text : '',
    confidence: deadline.matched ? 'high' : 'low',
  };
}

// ------------------------------------------------------------------ ageing

export type LedgerStatus = 'overdue' | 'today' | 'upcoming' | 'undated';

export function statusOf(commitment: { dueAt: Date | string | null }, now = new Date()): LedgerStatus {
  if (!commitment.dueAt) return 'undated';
  const due = commitment.dueAt instanceof Date ? commitment.dueAt : new Date(commitment.dueAt);
  if (Number.isNaN(due.getTime())) return 'undated';
  if (due.getTime() < now.getTime()) return 'overdue';
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return due.getTime() <= endOfToday.getTime() ? 'today' : 'upcoming';
}

export function ageInDays(createdAt: Date | string, now = new Date()): number {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000));
}

/**
 * Ledger ordering: overdue first, then today, then dated, then undated —
 * oldest first inside each band, so the thing rotting longest surfaces.
 */
const RANK: Record<LedgerStatus, number> = { overdue: 0, today: 1, upcoming: 2, undated: 3 };

export function sortLedger<
  T extends { dueAt: Date | string | null; createdAt: Date | string },
>(rows: T[], now = new Date()): T[] {
  return [...rows].sort((a, b) => {
    const rankDiff = RANK[statusOf(a, now)] - RANK[statusOf(b, now)];
    if (rankDiff !== 0) return rankDiff;

    if (a.dueAt && b.dueAt) {
      const diff = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (diff !== 0) return diff;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

/**
 * Does a later message look like it settled this commitment?
 *
 * Only a hint — it suggests closing the row, never closes it. Marking someone's
 * obligation done on a guess is worse than leaving it open.
 */
export function looksResolved(commitment: { what: string; evidence: string }, laterBody: string): boolean {
  const body = stripQuoted(laterBody).toLowerCase();
  if (!body) return false;

  const settled = [
    /\b(?:attached|attaching|enclosed|here'?s|here is|sent|sending)\b/,
    /\bas\s+promised\b/,
    /\bdone\b/,
    /\bsigned\b/,
    /\bcompleted\b/,
  ];
  if (!settled.some((pattern) => pattern.test(body))) return false;

  // Require some lexical overlap with the promise, so an unrelated "done" in a
  // different context does not close it.
  const words = commitment.what
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 4);
  if (!words.length) return false;
  const overlap = words.filter((word) => body.includes(word)).length;
  return overlap / words.length >= 0.3;
}

/** Headline numbers for the dashboard card. */
export function summarise(
  rows: Array<{ direction: Direction; dueAt: Date | string | null; createdAt: Date | string }>,
  now = new Date(),
) {
  const owed = rows.filter((r) => r.direction === 'owed');
  const awaiting = rows.filter((r) => r.direction === 'awaiting');
  const overdue = rows.filter((r) => statusOf(r, now) === 'overdue');
  const dueToday = rows.filter((r) => statusOf(r, now) === 'today');
  const oldest = rows.reduce(
    (worst, row) => Math.max(worst, ageInDays(row.createdAt, now)),
    0,
  );
  return {
    total: rows.length,
    owed: owed.length,
    awaiting: awaiting.length,
    overdue: overdue.length,
    dueToday: dueToday.length,
    oldestDays: oldest,
  };
}
