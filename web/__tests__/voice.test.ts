/**
 * The voice profile is what replaces "make it human" in the drafting prompt,
 * so these tests are really about whether that replacement is doing anything.
 */
import { describe, expect, it } from 'vitest';

import {
  EMPTY_VOICE,
  describeVoice,
  findTells,
  foreignLinks,
  profileVoice,
  stripForVoice,
} from '@/lib/voice';

const TERSE = [
  "Hi Maya,\n\nYes that works. I'll have it over by Thursday.\n\nThanks\nLucky",
  "Hi Sam,\n\nPrice is 40k for the full build. Happy to split it into two payments.\n\nThanks\nLucky",
  "Hi Raj,\n\nGot it. I'll push the fix tonight and let you know.\n\nThanks\nLucky",
];

describe('stripForVoice', () => {
  it('drops the quoted reply chain', () => {
    const body = "Sounds good.\n\nOn Mon, 3 Mar 2026 at 10:02, Maya <maya@x.com> wrote:\n> the whole previous email\n> more of it";
    expect(stripForVoice(body)).toBe('Sounds good.');
  });

  it('drops the signature after a -- line', () => {
    expect(stripForVoice('Thanks\n\n--\nLucky Gosai\nFounder, Owed\n+91 00000')).toBe('Thanks');
  });

  it('drops phone footers', () => {
    expect(stripForVoice('On my way.\n\nSent from my iPhone')).toBe('On my way.');
  });
});

describe('profileVoice', () => {
  const voice = profileVoice(TERSE);

  it('finds the greeting word and the punctuation separately', () => {
    // Both matter: "Hi Maya," and "Hi Maya" are different people.
    expect(voice.greeting).toBe('Hi');
    expect(voice.greetingPunctuation).toBe(',');
  });

  it('finds the sign-off', () => {
    expect(voice.signOff).toBe('Thanks');
  });

  it('measures how long they actually write', () => {
    expect(voice.replyWords).toBeGreaterThan(4);
    expect(voice.replyWords).toBeLessThan(40);
    expect(voice.sentenceWords).toBeGreaterThan(2);
  });

  it('notices contractions', () => {
    expect(voice.usesContractions).toBe(true);
    expect(profileVoice(['Dear Sam,\n\nI will send the document tomorrow morning.\n\nRegards']).usesContractions)
      .toBe(false);
  });

  it('treats a one-off as a one-off, not a habit', () => {
    // One exclamation in three emails is not a style.
    const mixed = profileVoice([...TERSE, 'Hi Jo,\n\nCongratulations! Really pleased for you.\n\nThanks\nLucky']);
    expect(mixed.usesExclamations).toBe(false);
  });

  it('reports no evidence rather than inventing a style', () => {
    expect(profileVoice([])).toEqual(EMPTY_VOICE);
    expect(profileVoice(['ok'])).toEqual(EMPTY_VOICE);
  });

  it('ignores a reply that is almost entirely quoted text', () => {
    const quoted = `Yes.\n\nOn Mon, 3 Mar 2026 at 10:02, Maya <maya@x.com> wrote:\n${'> padding line\n'.repeat(80)}`;
    expect(profileVoice([quoted]).sampleCount).toBe(0);
  });
});

describe('describeVoice', () => {
  it('states the measurements as facts the model can follow', () => {
    const text = describeVoice(profileVoice(TERSE));
    expect(text).toContain('Hi');
    expect(text).toContain('Thanks');
    expect(text).toMatch(/average/i);
    expect(text).toMatch(/em-dash/i);
  });

  it('admits when it knows nothing instead of guessing', () => {
    expect(describeVoice(EMPTY_VOICE)).toMatch(/nothing is known/i);
  });
});

describe('findTells — the check that backs up the prompt rule', () => {
  it('catches the phrases that mark a letter as generated', () => {
    expect(findTells('I hope this email finds you well. Thank you for reaching out.')).toEqual([
      'hope this finds you well',
      'thank you for reaching out',
    ]);
  });

  it('passes a plain reply', () => {
    expect(findTells("Yes, Thursday works. I'll send the file tonight.")).toEqual([]);
  });
});

describe('foreignLinks — a draft cannot introduce a URL', () => {
  const thread = 'Please review https://client.example/brief before Friday.';

  it('allows a link that was already in the thread', () => {
    expect(foreignLinks('Looked at https://client.example/brief, all good.', thread)).toEqual([]);
  });

  it('flags a link the model produced from nowhere', () => {
    // The attack: a sent email carries a link the recipient trusts because it
    // came from someone they know.
    expect(foreignLinks('Please pay at https://evil.example/pay now.', thread)).toEqual([
      'https://evil.example/pay',
    ]);
  });

  it('is not fooled by trailing punctuation', () => {
    expect(foreignLinks('See https://client.example/brief.', thread)).toEqual([]);
  });
});
