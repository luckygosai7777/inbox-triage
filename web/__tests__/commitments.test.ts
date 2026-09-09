import { describe, expect, it } from 'vitest';

import {
  ageInDays,
  extractCommitmentsHeuristic,
  looksResolved,
  reconcileCommitment,
  sortLedger,
  statusOf,
  summarise,
} from '@/lib/commitments';

const NOW = new Date(2026, 8, 2, 9, 0, 0); // Wednesday

const owed = (body: string) =>
  extractCommitmentsHeuristic(body, {
    direction: 'owed',
    counterparty: 'Maya Okonkwo',
    counterpartyEmail: 'maya@northline.co',
    now: NOW,
  });

const awaiting = (body: string) =>
  extractCommitmentsHeuristic(body, {
    direction: 'awaiting',
    counterparty: 'Priya Raman',
    counterpartyEmail: 'priya@ramanstudio.in',
    now: NOW,
  });

describe('extracting promises the user made', () => {
  it('catches a dated promise and keeps the sentence as proof', () => {
    const found = owed("Thanks for the call. I'll send the revised deck by Friday.");
    expect(found).toHaveLength(1);
    expect(found[0].what).toContain('send the revised deck');
    expect(found[0].evidence).toBe("I'll send the revised deck by Friday.");
    expect(found[0].confidence).toBe('high');
    expect(found[0].dueAt!.getDay()).toBe(5);
    expect(found[0].counterparty).toBe('Maya Okonkwo');
  });

  it('records an undated promise without inventing a date', () => {
    const found = owed("I'll review the contract and get back to you.");
    expect(found).toHaveLength(1);
    expect(found[0].dueAt).toBeNull();
    expect(found[0].confidence).toBe('low');
    expect(found[0].dueText).toBe('');
  });

  it('ignores a courtesy that commits to nothing', () => {
    expect(owed("Great to meet you. I'll be in touch.")).toHaveLength(0);
    expect(owed("I'll try to take a look at some point.")).toHaveLength(0);
    expect(owed("I'll let you know if anything changes.")).toHaveLength(0);
  });

  it('ignores a message with no promise at all', () => {
    expect(owed('Thanks, that all looks good to me.')).toHaveLength(0);
  });

  it('catches "I will" as well as "I\'ll"', () => {
    expect(owed('I will confirm the numbers by tomorrow.')).toHaveLength(1);
  });

  it('catches a team promise', () => {
    expect(owed("We'll ship the fix by Monday.")).toHaveLength(1);
  });

  it('does not re-extract promises quoted from earlier messages', () => {
    const body = "Sounds good.\n\nOn Mon, Maya wrote:\n> I'll send the deck by Friday.";
    expect(owed(body)).toHaveLength(0);
  });

  it('deduplicates a repeated promise', () => {
    const body = "I'll send the deck by Friday.\nI'll send the deck by Friday.";
    expect(owed(body)).toHaveLength(1);
  });

  it('caps how many it takes from one message', () => {
    const body = [
      "I'll send the deck.",
      "I'll review the contract.",
      "I'll confirm the numbers.",
      "I'll book the room.",
      "I'll draft the brief.",
    ].join('\n');
    expect(owed(body).length).toBeLessThanOrEqual(3);
  });
});

describe('extracting inbound asks', () => {
  it('catches a direct request', () => {
    const found = awaiting('Could you send the signed copy back?');
    expect(found).toHaveLength(1);
    expect(found[0].direction).toBe('awaiting');
    expect(found[0].counterpartyEmail).toBe('priya@ramanstudio.in');
  });

  it('catches a chase with a deadline', () => {
    const found = awaiting('Please confirm by Friday.');
    expect(found[0].confidence).toBe('high');
    expect(found[0].dueAt!.getDay()).toBe(5);
  });

  it('ignores a statement that asks nothing', () => {
    expect(awaiting('The invoice went out this morning.')).toHaveLength(0);
  });
});

describe('reconcileCommitment', () => {
  it('re-derives the date locally rather than trusting the model', () => {
    const result = reconcileCommitment(
      { what: 'Send the deck', evidence: "I'll send the deck by Friday." },
      { direction: 'owed', counterparty: 'Maya', counterpartyEmail: 'm@x.co', now: NOW },
    );
    expect(result.confidence).toBe('high');
    expect(result.dueAt!.getDay()).toBe(5);
  });

  it('drops a date the sentence does not actually support', () => {
    // Even if a model claimed a deadline, the parser finds none here.
    const result = reconcileCommitment(
      { what: 'Send the deck', evidence: "I'll send the deck at some point." },
      { direction: 'owed', counterparty: 'Maya', counterpartyEmail: 'm@x.co', now: NOW },
    );
    expect(result.dueAt).toBeNull();
    expect(result.confidence).toBe('low');
  });

  it('truncates an over-long summary', () => {
    const result = reconcileCommitment(
      { what: 'x'.repeat(300), evidence: 'whatever' },
      { direction: 'owed', counterparty: 'A', counterpartyEmail: 'a@b.co', now: NOW },
    );
    expect(result.what.length).toBeLessThanOrEqual(120);
  });
});

describe('ledger status and ordering', () => {
  const iso = (offsetHours: number) =>
    new Date(NOW.getTime() + offsetHours * 3600000).toISOString();

  it('classifies by due date', () => {
    expect(statusOf({ dueAt: iso(-24) }, NOW)).toBe('overdue');
    expect(statusOf({ dueAt: iso(4) }, NOW)).toBe('today');
    expect(statusOf({ dueAt: iso(72) }, NOW)).toBe('upcoming');
    expect(statusOf({ dueAt: null }, NOW)).toBe('undated');
  });

  it('sorts overdue first, then today, then dated, then undated', () => {
    const rows = [
      { id: 'undated', dueAt: null, createdAt: iso(-100) },
      { id: 'upcoming', dueAt: iso(72), createdAt: iso(-10) },
      { id: 'overdue', dueAt: iso(-24), createdAt: iso(-30) },
      { id: 'today', dueAt: iso(4), createdAt: iso(-5) },
    ];
    expect(sortLedger(rows, NOW).map((r) => r.id)).toEqual([
      'overdue',
      'today',
      'upcoming',
      'undated',
    ]);
  });

  it('surfaces the oldest first within a band', () => {
    const rows = [
      { id: 'newer', dueAt: null, createdAt: iso(-24) },
      { id: 'older', dueAt: null, createdAt: iso(-240) },
    ];
    expect(sortLedger(rows, NOW).map((r) => r.id)).toEqual(['older', 'newer']);
  });

  it('measures age in whole days', () => {
    expect(ageInDays(iso(-72), NOW)).toBe(3);
    expect(ageInDays(iso(-1), NOW)).toBe(0);
  });
});

describe('resolution hints', () => {
  const commitment = { what: 'Send the revised deck', evidence: "I'll send the revised deck by Friday." };

  it('flags a later message that appears to deliver', () => {
    expect(looksResolved(commitment, 'Attached is the revised deck, as promised.')).toBe(true);
  });

  it('does not flag an unrelated "done"', () => {
    expect(looksResolved(commitment, 'The invoice is done, thanks.')).toBe(false);
  });

  it('does not flag a message that delivers nothing', () => {
    expect(looksResolved(commitment, 'Still working on it, sorry for the delay.')).toBe(false);
  });

  it('ignores quoted text when judging', () => {
    expect(looksResolved(commitment, '> Attached is the revised deck\n\nNot yet actually.')).toBe(
      false,
    );
  });
});

describe('summarise', () => {
  it('counts the headline numbers', () => {
    const iso = (h: number) => new Date(NOW.getTime() + h * 3600000).toISOString();
    const rows = [
      { direction: 'owed' as const, dueAt: iso(-24), createdAt: iso(-100) },
      { direction: 'owed' as const, dueAt: iso(4), createdAt: iso(-48) },
      { direction: 'awaiting' as const, dueAt: null, createdAt: iso(-240) },
    ];
    const summary = summarise(rows, NOW);
    expect(summary).toMatchObject({
      total: 3,
      owed: 2,
      awaiting: 1,
      overdue: 1,
      dueToday: 1,
      oldestDays: 10,
    });
  });
});
