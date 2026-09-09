/**
 * Demo mode — lets the app run locally with no Supabase project and no Google
 * account, so the UI can be driven before any of that is set up.
 *
 * SAFETY: this bypasses authentication, so it is gated twice. It requires
 * DEMO_MODE=true *and* a non-production NODE_ENV, and `assertNotProduction()`
 * throws at startup if anyone tries to ship it enabled. Vercel sets
 * NODE_ENV=production on every deploy, so this cannot switch on there.
 */

/** Shaped like a Supabase User so it can stand in for one in demo mode. */
export const DEMO_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'demo@dayone.studio',
  app_metadata: {},
  user_metadata: { full_name: 'Demo User' },
  aud: 'authenticated',
  created_at: new Date(0).toISOString(),
};

export function isDemo(): boolean {
  return process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

/** Hard stop: demo mode must never be reachable in a production build. */
export function assertNotProduction(): void {
  if (process.env.DEMO_MODE === 'true' && process.env.NODE_ENV === 'production') {
    throw new Error(
      'DEMO_MODE=true in a production build. This disables authentication. ' +
        'Remove DEMO_MODE from your deployment environment variables.',
    );
  }
}

const hoursAgo = (n: number) => new Date(Date.now() - n * 3600_000);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const at = (hour: number, dayOffset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
};

// ------------------------------------------------------------------- ledger

export function demoCommitments() {
  const rows = [
    {
      id: 'c1',
      direction: 'owed' as const,
      what: 'Send the revised deck',
      counterparty: 'Maya Okonkwo',
      counterpartyEmail: 'maya.okonkwo@northline.co',
      evidence: "I'll send the revised deck by Friday, once legal have looked at section 4.",
      dueAt: at(18, -2).toISOString(),
      dueText: 'Friday, 18:00',
      confidence: 'high' as const,
      status: 'open',
      resolvedHint: false,
      createdAt: daysAgo(6).toISOString(),
      threadId: 't1',
    },
    {
      id: 'c2',
      direction: 'owed' as const,
      what: 'Confirm the March retainer numbers',
      counterparty: 'Priya Raman',
      counterpartyEmail: 'priya@ramanstudio.in',
      evidence: "I'll confirm the numbers by end of day.",
      dueAt: at(18).toISOString(),
      dueText: 'Today, 18:00',
      confidence: 'high' as const,
      status: 'open',
      resolvedHint: false,
      createdAt: daysAgo(1).toISOString(),
      threadId: 't2',
    },
    {
      id: 'c3',
      direction: 'owed' as const,
      what: 'Review the rebrand scope doc',
      counterparty: 'Ravi Menon',
      counterpartyEmail: 'ravi.menon@menonbrand.com',
      evidence: "I'll review the scope doc and get back to you with comments.",
      dueAt: null,
      dueText: '',
      confidence: 'low' as const,
      status: 'open',
      resolvedHint: false,
      createdAt: daysAgo(11).toISOString(),
      threadId: 't3',
    },
    {
      id: 'c4',
      direction: 'owed' as const,
      what: 'Send over the portfolio PDF',
      counterparty: 'Tom Bekele',
      counterpartyEmail: 'tom.bekele@creatorsummit.org',
      evidence: "I'll send over the portfolio PDF this week.",
      dueAt: null,
      dueText: '',
      confidence: 'low' as const,
      status: 'open',
      // A later message in the thread looks like it delivered this.
      resolvedHint: true,
      createdAt: daysAgo(4).toISOString(),
      threadId: 't4',
    },
    {
      id: 'c5',
      direction: 'awaiting' as const,
      what: 'Accept or decline the Nov 14 keynote',
      counterparty: 'Tom Bekele',
      counterpartyEmail: 'tom.bekele@creatorsummit.org',
      evidence: 'Need an answer by Friday so we can lock the running order.',
      dueAt: at(18, -1).toISOString(),
      dueText: 'Friday, 18:00',
      confidence: 'high' as const,
      status: 'open',
      resolvedHint: false,
      createdAt: daysAgo(3).toISOString(),
      threadId: 't5',
    },
    {
      id: 'c6',
      direction: 'awaiting' as const,
      what: 'Lock Thursday for the podcast slot',
      counterparty: 'Devon Hart',
      counterpartyEmail: 'devon@hartmedia.fm',
      evidence: 'Either 2pm or 4pm works on my end — can we lock Thursday?',
      dueAt: null,
      dueText: '',
      confidence: 'low' as const,
      status: 'open',
      resolvedHint: false,
      createdAt: daysAgo(2).toISOString(),
      threadId: 't6',
    },
    {
      id: 'c7',
      direction: 'awaiting' as const,
      what: 'Confirm invoice #2291 status',
      counterparty: 'Priya Raman',
      counterpartyEmail: 'priya@ramanstudio.in',
      evidence: "Following up on the March retainer — let me know if it's stuck.",
      dueAt: null,
      dueText: '',
      confidence: 'low' as const,
      status: 'open',
      resolvedHint: false,
      createdAt: daysAgo(14).toISOString(),
      threadId: 't7',
    },
  ];
  return rows;
}

// -------------------------------------------------------------------- inbox

export function demoMail() {
  return [
    {
      id: 'm1', gmailMessageId: 'm1', threadId: 't1',
      fromName: 'Maya Okonkwo', fromEmail: 'maya.okonkwo@northline.co',
      subject: 'Contract redline - needs your sign-off today',
      preview: 'Attached the marked-up version, section 4 is the only open item.',
      category: 'Clients', priority: 0, sentAt: hoursAgo(3).toISOString(),
      isUnread: true, needsReply: true, effortMinutes: 12,
      dueAt: at(18).toISOString(), topics: 'contract legal agreement signature deal',
    },
    {
      id: 'm2', gmailMessageId: 'm2', threadId: 't7',
      fromName: 'Priya Raman', fromEmail: 'priya@ramanstudio.in',
      subject: 'Invoice #2291 is 12 days overdue',
      preview: "Following up on the March retainer - let me know if it's stuck.",
      category: 'Clients', priority: 0, sentAt: hoursAgo(7).toISOString(),
      isUnread: true, needsReply: true, effortMinutes: 8,
      dueAt: at(11).toISOString(), topics: 'money invoice billing overdue chasing finance',
    },
    {
      id: 'm3', gmailMessageId: 'm3', threadId: 't5',
      fromName: 'Tom Bekele', fromEmail: 'tom.bekele@creatorsummit.org',
      subject: 'Speaking invite - Creator Summit, Nov 14',
      preview: '20 minute keynote, travel covered. Need an answer by Friday.',
      category: 'Collabs', priority: 0, sentAt: hoursAgo(27).toISOString(),
      isUnread: true, needsReply: true, effortMinutes: 10,
      dueAt: null, topics: 'event speaking travel conference invitation meeting',
    },
    {
      id: 'm4', gmailMessageId: 'm4', threadId: 't6',
      fromName: 'Devon Hart', fromEmail: 'devon@hartmedia.fm',
      subject: 'Re: podcast slot - can we lock Thursday?',
      preview: 'Either 2pm or 4pm works on my end, whichever is easier.',
      category: 'Collabs', priority: 1, sentAt: hoursAgo(5).toISOString(),
      isUnread: true, needsReply: true, effortMinutes: 4,
      dueAt: null, topics: 'meeting scheduling calendar podcast interview',
    },
    {
      id: 'm5', gmailMessageId: 'm5', threadId: 't8',
      fromName: 'Notion', fromEmail: 'notify@notion.so',
      subject: 'Aisha commented on Q4 launch plan',
      preview: 'Can we move the beta gate a week earlier?',
      category: 'Social', priority: 1, sentAt: hoursAgo(26).toISOString(),
      isUnread: true, needsReply: true, effortMinutes: 3,
      dueAt: null, topics: 'comment feedback product launch planning',
    },
    {
      id: 'm6', gmailMessageId: 'm6', threadId: 't3',
      fromName: 'Ravi Menon', fromEmail: 'ravi.menon@menonbrand.com',
      subject: 'Re: Re: revised scope for the rebrand',
      preview: 'Sounds good - one question about the timeline on phase two.',
      category: 'Clients', priority: 1, sentAt: hoursAgo(50).toISOString(),
      isUnread: false, needsReply: true, effortMinutes: 6,
      dueAt: null, topics: 'project scope timeline branding design work',
    },
    {
      id: 'm7', gmailMessageId: 'm7', threadId: 't9',
      fromName: 'Stripe', fromEmail: 'receipts@stripe.com',
      subject: 'Payout of $4,120.00 is on the way',
      preview: 'Expected to arrive Sep 3. No action needed.',
      category: 'Receipts', priority: 2, sentAt: hoursAgo(4).toISOString(),
      isUnread: false, needsReply: false, effortMinutes: 1,
      dueAt: null, topics: 'money payment payout finance bank income',
    },
    {
      id: 'm8', gmailMessageId: 'm8', threadId: 't10',
      fromName: 'The Long Read', fromEmail: 'hello@thelongread.com',
      subject: 'This week: nine essays you missed',
      preview: "Plus our editor's pick and a reader mailbag.",
      category: 'Newsletters', priority: 2, sentAt: hoursAgo(6).toISOString(),
      isUnread: true, needsReply: false, effortMinutes: 1,
      dueAt: null, topics: 'reading articles digest media',
    },
    {
      id: 'm9', gmailMessageId: 'm9', threadId: 't11',
      fromName: 'Figma', fromEmail: 'billing@figma.com',
      subject: 'Your plan renews in 7 days',
      preview: 'Annual plan, 3 editors. Manage billing anytime.',
      category: 'Receipts', priority: 2, sentAt: hoursAgo(28).toISOString(),
      isUnread: false, needsReply: false, effortMinutes: 1,
      dueAt: null, topics: 'money billing subscription renewal finance',
    },
    {
      id: 'm10', gmailMessageId: 'm10', threadId: 't12',
      fromName: 'Dribbble Weekly', fromEmail: 'weekly@dribbble.com',
      subject: 'Top shots of the week',
      preview: 'Trending in dark UI, motion, and editorial layout.',
      category: 'Newsletters', priority: 2, sentAt: hoursAgo(51).toISOString(),
      isUnread: true, needsReply: false, effortMinutes: 1,
      dueAt: null, topics: 'design inspiration reading digest',
    },
  ];
}

export const DEMO_VIPS = new Set([
  'maya.okonkwo@northline.co',
  'priya@ramanstudio.in',
  'tom.bekele@creatorsummit.org',
]);

/** Today's meetings, as hours since midnight. */
export function demoMeetings() {
  return [
    { title: 'Standup', start: 9, end: 9.25 },
    { title: 'Design review', start: 10.5, end: 11.5 },
    { title: 'Lunch', start: 12.5, end: 13 },
    { title: '1:1 - Priya', start: 14, end: 14.5 },
    { title: 'Client call - Northwind', start: 15.5, end: 16.5 },
  ];
}
