import { describe, expect, it } from 'vitest';

import {
  compose,
  composeLine,
  documentApplies,
  flatten,
  gmailComposeUrl,
  logNote,
  openerFor,
  type CampaignShape,
  type Recipient,
} from '@/lib/composer';
import { scoreItem, search, tokenize, type Searchable } from '@/lib/search';

const recipient: Recipient = {
  email: 'nadia@northwind.studio',
  name: 'Nadia Faruk',
  org: 'Northwind Studio',
  role: 'Senior Product Designer',
};

const campaign: CampaignShape = {
  tone: 'Formal',
  intensity: 'Tokens + opener',
  grounding: '',
  subjectTemplate: '[role] - Jordan Diaz',
  bodyTemplate: 'Hi [first],\n\n[ai_opener]\n\nAbout [org].\n\n[ai_signoff]\nJordan',
};

const aiParts = (paragraphs: ReturnType<typeof compose>) =>
  paragraphs.flatMap((p) => p.parts.filter((part) => part.ai).map((part) => part.text));

describe('token substitution', () => {
  it('fills tokens from the recipient', () => {
    const body = flatten(compose(campaign.bodyTemplate, recipient, campaign));
    expect(body).toContain('Hi Nadia,');
    expect(body).toContain('About Northwind Studio.');
    expect(body).not.toContain('[first]');
    expect(body).not.toContain('[org]');
  });

  it('does not mark CSV values as model-written', () => {
    expect(aiParts(compose('Hi [first] at [org].', recipient, campaign))).toEqual([]);
  });

  it('marks the opener as model-written', () => {
    const ai = aiParts(compose('[ai_opener]', recipient, campaign));
    expect(ai).toHaveLength(1);
    expect(ai[0]).toContain('Northwind Studio');
  });

  it('leaves an unknown token alone', () => {
    expect(flatten(compose('Value: [not_a_token]', recipient, campaign))).toBe(
      'Value: [not_a_token]',
    );
  });

  it('falls back to a neutral phrase for a missing org', () => {
    const bare = { ...recipient, org: '' };
    expect(flatten(compose('About [org].', bare, campaign))).toBe('About your team.');
  });

  it('preserves paragraph structure', () => {
    const rendered = compose('One\n\nTwo\n\nThree', recipient, campaign);
    expect(rendered.map((p) => flatten([p]))).toEqual(['One', 'Two', 'Three']);
  });

  it('renders a subject as a single line', () => {
    const parts = composeLine(campaign.subjectTemplate, recipient, campaign);
    expect(parts.map((p) => p.text).join('')).toBe('Senior Product Designer - Jordan Diaz');
  });
});

describe('intensity and tone', () => {
  it('writes nothing new on tokens-only', () => {
    const only = { ...campaign, intensity: 'Tokens only' };
    const rendered = compose('[ai_opener]', recipient, only);
    expect(flatten(rendered)).toBe('Hope this finds you well.');
    expect(aiParts(rendered)).toEqual([]);
  });

  it('does not treat the default signoff as authored', () => {
    const rendered = compose('[ai_signoff]', recipient, campaign);
    expect(flatten(rendered)).toBe('Kind regards,');
    expect(aiParts(rendered)).toEqual([]);
  });

  it('marks a non-default signoff as authored', () => {
    const warm = { ...campaign, tone: 'Warm' };
    const rendered = compose('[ai_signoff]', recipient, warm);
    expect(flatten(rendered)).toBe('Thanks so much,');
    expect(aiParts(rendered)).toEqual(['Thanks so much,']);
  });
});

describe('openers', () => {
  it('quotes the source when grounded', () => {
    const opener = openerFor(recipient, 'We are hiring a staff designer for our payments team.');
    expect(opener).toContain('hiring a staff designer');
    expect(opener.startsWith('You mentioned')).toBe(true);
  });

  it('varies by role when ungrounded', () => {
    expect(
      openerFor({ ...recipient, role: 'Design Systems Engineer', org: 'Fernpath' }).toLowerCase(),
    ).toContain('design systems');
    expect(
      openerFor({ ...recipient, role: 'Head of Design', org: 'Orchard Nine' }).toLowerCase(),
    ).toContain('design org');
  });

  it('uses the fallback for an unknown role', () => {
    expect(openerFor({ ...recipient, role: 'Accountant', org: 'Ledger Co' })).toContain('Ledger Co');
  });
});

describe('attachment rules', () => {
  it('attaches to everyone when blank', () => {
    expect(documentApplies('', 'Accountant')).toBe(true);
  });

  it('matches a keyword against the role, case-insensitively', () => {
    expect(documentApplies('design', 'Senior Product Designer')).toBe(true);
    expect(documentApplies('design', 'DESIGN LEAD')).toBe(true);
    expect(documentApplies('design', 'Accountant')).toBe(false);
  });
});

describe('gmail link', () => {
  it('carries recipient, subject and body', () => {
    const url = new URL(gmailComposeUrl('nadia@northwind.studio', 'Hello', 'Hi Nadia,'));
    expect(url.host).toBe('mail.google.com');
    expect(url.searchParams.get('view')).toBe('cm');
    expect(url.searchParams.get('to')).toBe('nadia@northwind.studio');
    expect(url.searchParams.get('su')).toBe('Hello');
    expect(url.searchParams.get('body')).toBe('Hi Nadia,');
  });

  it('describes what the model did', () => {
    expect(logNote({ ...campaign, intensity: 'Tokens only' }, recipient)).toBe('tokens filled');
    expect(logNote(campaign, recipient)).toContain('generic opener');
    expect(logNote({ ...campaign, grounding: 'We are hiring.' }, recipient)).toContain(
      'grounded opener',
    );
  });
});

// ------------------------------------------------------------------ search

const message = (over: Partial<Searchable>): Searchable => ({
  id: '1',
  fromName: 'Maya Okonkwo',
  fromEmail: 'maya.okonkwo@northline.co',
  subject: 'Contract redline - needs your sign-off today',
  category: 'Clients',
  preview: 'Attached the marked-up version, section 4 is the only open item.',
  topics: 'contract legal agreement signature',
  priority: 0,
  sentAt: new Date(2026, 8, 2, 9, 4),
  ...over,
});

const maya = message({});
const priya = message({
  id: '2',
  fromName: 'Priya Raman',
  fromEmail: 'priya@ramanstudio.in',
  subject: 'Invoice #2291 is 12 days overdue',
  preview: 'Following up on the March retainer.',
  topics: 'money invoice billing payment overdue',
});
const stripe = message({
  id: '3',
  fromName: 'Stripe',
  fromEmail: 'receipts@stripe.com',
  subject: 'Payout of $4,120.00 is on the way',
  category: 'Receipts',
  preview: 'Expected to arrive Sep 3. No action needed.',
  topics: 'money payment payout finance bank',
  priority: 2,
});

const ids = (query: string) => search([maya, priya, stripe], query).map((h) => h.item.id);

describe('search', () => {
  it('returns everything for an empty query', () => {
    expect(ids('')).toHaveLength(3);
  });

  it('matches a sender name and an address', () => {
    expect(ids('maya')).toEqual(['1']);
    expect(ids('ramanstudio')).toEqual(['2']);
  });

  it('finds mail via topic keywords with no literal match', () => {
    // "money" appears in neither subject nor preview of the Stripe payout.
    expect(ids('money')).toContain('3');
  });

  it('ANDs tokens rather than ORing them', () => {
    expect(ids('priya invoice')).toEqual(['2']);
    expect(ids('maya invoice')).toEqual([]);
  });

  it('ranks a word-start match above a mid-word one', () => {
    const start = scoreItem(maya, ['contract'])!;
    const mid = scoreItem(maya, ['ontract'])!;
    expect(start.score).toBeGreaterThan(mid.score);
  });

  it('flags a person hit so the UI can show the address', () => {
    expect(search([maya], 'maya')[0].matchedPerson).toBe(true);
    expect(search([maya], 'redline')[0].matchedPerson).toBe(false);
  });

  it('is case insensitive', () => {
    expect(ids('MAYA')).toEqual(['1']);
  });

  it('searches the priority label', () => {
    expect(ids('urgent').sort()).toEqual(['1', '2']);
  });

  it('returns hits in descending score order', () => {
    const scores = search([maya, priya, stripe], 'money').map((h) => h.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('tokenizes on whitespace', () => {
    expect(tokenize('  Priya   Invoice ')).toEqual(['priya', 'invoice']);
  });
});
