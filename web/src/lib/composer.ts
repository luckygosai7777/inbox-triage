/**
 * Per-recipient message rendering for bulk send.
 *
 * `compose` returns marked-up parts rather than a flat string so the preview can
 * show exactly which words the model wrote. Each part carries `ai: true` when
 * the model authored it (as opposed to merely filling a CSV value in), which is
 * what the UI paints in the accent colour.
 */

export type Part = { text: string; ai: boolean };
export type Paragraph = { parts: Part[] };

export type Recipient = {
  email: string;
  name: string;
  org?: string | null;
  role?: string | null;
};

export type CampaignShape = {
  tone: string;
  intensity: string;
  grounding?: string | null;
  subjectTemplate: string;
  bodyTemplate: string;
};

export const USE_CASES: Record<string, { subject: string; body: string }> = {
  'Job application': {
    subject: '[role] - Jordan Diaz',
    body:
      "Hi [first],\n\n[ai_opener]\n\nI'm applying for the [role] role at [org]. I've spent six " +
      'years on product teams shipping design systems and end-to-end flows, most recently taking ' +
      'a payments redesign from research through launch.\n\nMy resume is attached. Happy to walk ' +
      "through anything in more detail if it's useful.\n\n[ai_signoff]\nJordan Diaz",
  },
  'Recruiter outreach': {
    subject: '[role] role - would you be open to a chat?',
    body:
      "Hi [first],\n\n[ai_opener]\n\nI'm hiring a [role] and your work at [org] is exactly the " +
      'profile we keep coming back to. The team is six people, remote-first, and the role owns ' +
      "its surface end to end.\n\nI've attached the role brief. Even if now isn't the moment, " +
      "I'd value knowing what would make it interesting.\n\n[ai_signoff]\nJordan Diaz",
  },
  'Sales intro': {
    subject: "Cutting [org]'s inbox load",
    body:
      'Hi [first],\n\n[ai_opener]\n\nTeams like [org] usually lose an hour a day to triage. We ' +
      'cut that by sorting mail by reply priority and clearing dead subscriptions automatically ' +
      '- most teams see it inside a week.\n\nOne-pager attached. Worth fifteen minutes?\n\n' +
      '[ai_signoff]\nJordan Diaz',
  },
  Custom: {
    subject: 'Quick note for [first]',
    body:
      'Hi [first],\n\n[ai_opener]\n\nWrite your message here. Use the tokens above for anything ' +
      'that changes per recipient - [name], [org], [role].\n\n[ai_signoff]\nJordan Diaz',
  },
};

const OPENERS: Record<string, string> = {
  systems:
    'The design systems work at [org] is the kind of infrastructure most teams skip, and it shows in your product.',
  brand: "[org]'s brand work has a point of view, which is harder to pull off than it looks.",
  manage:
    "I noticed you're building out the design org at [org] - that's usually where the interesting problems are.",
  design:
    "I've been following the design work coming out of [org] - the craft in your recent product surfaces stands out.",
  product:
    "I've been watching how [org] ships product, and the pace without loss of polish is rare.",
  fallback: 'I came across [org] recently and the way your team works stuck with me.',
};

export const SIGNOFFS: Record<string, string> = {
  Formal: 'Kind regards,',
  Warm: 'Thanks so much,',
  Direct: 'Best,',
};

export const TOKENS = ['[first]', '[name]', '[org]', '[role]'];

const TOKEN_RE = /(\[[a-z_]+\])/;

export function firstName(name: string): string {
  return (name ?? '').split(' ')[0] ?? '';
}

/** Grounded openers quote the user's source; ungrounded ones are generic. */
export function openerFor(recipient: Recipient, grounding?: string | null): string {
  const source = (grounding ?? '').trim();
  if (source) {
    let clause = source.split(/[.\n]/)[0].trim().replace(/^(i|we)\s+/i, '').trim();
    if (clause) {
      clause = clause.charAt(0).toLowerCase() + clause.slice(1);
      return `You mentioned ${clause} - that's what prompted me to write.`;
    }
  }

  const role = (recipient.role ?? '').toLowerCase();
  const org = recipient.org || 'your team';
  let key = 'fallback';
  if (role.includes('system')) key = 'systems';
  else if (role.includes('brand')) key = 'brand';
  else if (['manager', 'head', 'lead'].some((word) => role.includes(word))) key = 'manage';
  else if (role.includes('design')) key = 'design';
  else if (role.includes('product')) key = 'product';

  return OPENERS[key].replace('[org]', org);
}

export function compose(
  text: string,
  recipient: Recipient,
  campaign: CampaignShape,
): Paragraph[] {
  const tokensOnly = campaign.intensity === 'Tokens only';
  const org = recipient.org || 'your team';

  const values: Record<string, string> = {
    '[first]': firstName(recipient.name),
    '[name]': recipient.name,
    '[org]': org,
    '[role]': recipient.role || 'there',
    '[ai_opener]': tokensOnly
      ? 'Hope this finds you well.'
      : openerFor(recipient, campaign.grounding),
    '[ai_signoff]': SIGNOFFS[campaign.tone] ?? SIGNOFFS.Formal,
  };

  // Tokens the model authored, as opposed to values copied from the CSV.
  const authored: Record<string, boolean> = {
    '[ai_opener]': !tokensOnly,
    '[ai_signoff]': campaign.tone !== 'Formal',
  };

  return (text ?? '').split('\n\n').map((paragraph) => ({
    parts: paragraph
      .split(TOKEN_RE)
      .filter(Boolean)
      .map((chunk) =>
        chunk in values
          ? { text: values[chunk], ai: authored[chunk] ?? false }
          : { text: chunk, ai: false },
      ),
  }));
}

export function composeLine(
  text: string,
  recipient: Recipient,
  campaign: CampaignShape,
): Part[] {
  const rendered = compose(text, recipient, campaign);
  return rendered.length ? rendered[0].parts : [];
}

export function flatten(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((paragraph) => paragraph.parts.map((part) => part.text).join(''))
    .join('\n\n');
}

export function documentApplies(attachRule: string | null | undefined, role: string | null | undefined): boolean {
  const rule = (attachRule ?? '').trim().toLowerCase();
  if (!rule) return true;
  return (role ?? '').toLowerCase().includes(rule);
}

/** Gmail deep link. It cannot carry attachments - the UI says so. */
export function gmailComposeUrl(email: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: email,
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function logNote(campaign: CampaignShape, recipient: Recipient): string {
  if (campaign.intensity === 'Tokens only') return 'tokens filled';
  const target = recipient.org || recipient.email;
  return (campaign.grounding ?? '').trim()
    ? `grounded opener for ${target}`
    : `generic opener for ${target}`;
}
