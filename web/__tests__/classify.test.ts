/**
 * Who counts as a client?
 *
 * These tests exist because a Google security alert was filed under "Clients".
 * The old rule made Clients the catch-all: anything that was not a newsletter,
 * a receipt or a social notification landed there. The fix is that a
 * person-category has to be earned — by a human sender, and for Clients, by
 * evidence the user has actually written to them.
 */
import { describe, expect, it } from 'vitest';

import { clampCategory, heuristicClassify, type ClassifyInput } from '@/lib/llm';
import { senderKind } from '@/lib/parsing';

function classify(overrides: Partial<ClassifyInput>) {
  const input: ClassifyInput = {
    id: 'm1',
    fromName: 'Someone',
    fromEmail: 'someone@example.com',
    subject: 'Hello',
    preview: 'Hello there',
    ...overrides,
  };
  return heuristicClassify(input);
}

describe('senderKind', () => {
  it('trusts Auto-Submitted over everything else', () => {
    expect(senderKind({ 'auto-submitted': 'auto-generated' }, 'ceo@acme.com')).toBe('automated');
  });

  it('ignores Auto-Submitted: no, which every normal mail may carry', () => {
    expect(senderKind({ 'auto-submitted': 'no' }, 'ceo@acme.com')).toBe('person');
  });

  it('reads the Microsoft and bulk-sender headers', () => {
    expect(senderKind({ 'x-auto-response-suppress': 'All' }, 'a@b.com')).toBe('automated');
    expect(senderKind({ 'feedback-id': '1:2:3:mailer' }, 'a@b.com')).toBe('automated');
    expect(senderKind({ precedence: 'auto_reply' }, 'a@b.com')).toBe('automated');
  });

  it('recognises no-reply addresses in their many spellings', () => {
    for (const local of ['no-reply', 'noreply', 'do-not-reply', 'donotreply', 'notifications', 'mailer-daemon', 'alerts+billing']) {
      expect(senderKind({}, `${local}@example.com`), local).toBe('automated');
    }
  });

  it('does not treat staffed shared mailboxes as robots', () => {
    // A human reads support@ and hello@. Filing them as Notifications would
    // hide real conversations, which is worse than the bug we are fixing.
    for (const local of ['support', 'info', 'hello', 'contact', 'sales']) {
      expect(senderKind({}, `${local}@example.com`), local).toBe('person');
    }
  });

  it('separates list mail from robot mail', () => {
    expect(senderKind({ 'list-unsubscribe': '<https://x.test/u>' }, 'news@example.com')).toBe('list');
  });

  it('falls back to the body only when headers say nothing', () => {
    expect(senderKind({}, 'billing@vendor.com', 'This is an automated message.')).toBe('automated');
  });
});

describe('heuristicClassify', () => {
  it('files a Google security alert as a notification, not a client', () => {
    const row = classify({
      fromName: 'Google',
      fromEmail: 'no-reply@accounts.google.com',
      subject: 'Security alert',
      preview: 'A new sign-in on Windows',
      senderKind: 'automated',
    });
    expect(row.category).toBe('Notifications');
    expect(row.needsReply).toBe(false);
  });

  it('never lets an automated sender reach a person-category', () => {
    const row = classify({
      fromEmail: 'noreply@stripe.com',
      subject: 'Can you confirm your details?',
      preview: 'Please confirm by Friday.',
      senderKind: 'automated',
      hasCorresponded: true,
    });
    expect(['Notifications', 'Receipts']).toContain(row.category);
    expect(row.needsReply).toBe(false);
  });

  it('routes an automated receipt to Receipts rather than Notifications', () => {
    const row = classify({
      fromEmail: 'no-reply@shop.example',
      subject: 'Your invoice #4821',
      preview: 'Payment received. Total ₹1,299.',
      senderKind: 'automated',
    });
    expect(row.category).toBe('Receipts');
  });

  it('calls a stranger Other, however human they look', () => {
    const row = classify({
      fromName: 'Priya Nair',
      fromEmail: 'priya@newagency.com',
      subject: 'Quick question about your rates',
      preview: 'Are you free next week?',
      senderKind: 'person',
      hasCorresponded: false,
    });
    expect(row.category).toBe('Other');
    // Still a real question from a real person — it should be answerable.
    expect(row.needsReply).toBe(true);
  });

  it('promotes to Clients once the user has written back', () => {
    const row = classify({
      fromName: 'Priya Nair',
      fromEmail: 'priya@newagency.com',
      subject: 'Quick question about your rates',
      preview: 'Are you free next week?',
      senderKind: 'person',
      hasCorresponded: true,
    });
    expect(row.category).toBe('Clients');
    expect(row.needsReply).toBe(true);
  });

  it('files list mail as a newsletter and asks nothing of the user', () => {
    const row = classify({
      fromEmail: 'weekly@substack.example',
      subject: 'Issue 42: what changed this week?',
      preview: 'Plus three links.',
      senderKind: 'list',
      hasCorresponded: true,
    });
    expect(row.category).toBe('Newsletters');
    expect(row.needsReply).toBe(false);
  });

  it('gives a non-person no due date, even when the text names one', () => {
    const row = classify({
      fromEmail: 'no-reply@vendor.example',
      subject: 'Action required',
      preview: 'Renew by 3 March 2027 to avoid interruption.',
      senderKind: 'automated',
    });
    expect(row.dueAt).toBeNull();
  });
});

describe('clampCategory — the repair pass over rows classified by older rules', () => {
  it('moves an automated sender out of Clients', () => {
    expect(
      clampCategory('Clients', 'automated', { text: 'Security alert', hasCorresponded: true }),
    ).toBe('Notifications');
  });

  it('sends an automated receipt to Receipts, not Notifications', () => {
    expect(
      clampCategory('Clients', 'automated', { text: 'Your invoice #4821 payment' }),
    ).toBe('Receipts');
  });

  it('moves list mail to Newsletters', () => {
    expect(clampCategory('Personal', 'list', { text: 'Issue 42' })).toBe('Newsletters');
  });

  it('leaves a genuine client alone', () => {
    expect(
      clampCategory('Clients', 'person', { text: 'Re: contract', hasCorresponded: true }),
    ).toBe('Clients');
  });

  it('demotes a client the user has never written to', () => {
    expect(
      clampCategory('Clients', 'person', { text: 'Re: contract', hasCorresponded: false }),
    ).toBe('Other');
  });

  it('rejects a category that is not one of ours', () => {
    expect(clampCategory('Urgent!!!', 'person', { text: 'hi' })).toBe('Other');
    expect(clampCategory(null, 'person', { text: 'hi' })).toBe('Other');
  });
});
