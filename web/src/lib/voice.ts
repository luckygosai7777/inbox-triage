/**
 * What the user's own writing looks like, measured from their sent mail.
 *
 * WHY THIS EXISTS
 *
 * The obvious way to stop a drafted email sounding like a machine is to put
 * "make it human" in the prompt. It does not work, and it is worth being clear
 * about why: "human" is not a property the model can check its output against.
 * It has no shared referent with you. Ask ten people to write a human email and
 * you get ten different things, so the instruction adds nothing the model can
 * act on, and it tends to produce a *performance* of informality — more
 * exclamation marks, a chattier opener, the same generic voice with different
 * decoration.
 *
 * What does work is measurable constraints taken from real examples. This file
 * reads the mail the user has actually sent and reports the things that
 * separate one writer from another: how long their sentences run, whether they
 * greet by name, what they sign off with, whether they use contractions, and
 * the small tells (em-dashes, "I hope this finds you well", triple-item lists)
 * that mark generated prose.
 *
 * The model then gets facts — "this person opens with 'Hi Maya,', averages 11
 * words a sentence, never uses em-dashes, signs off 'Thanks'" — plus two real
 * excerpts to imitate. That is something it can be held to, and something the
 * draft can be checked against afterwards.
 *
 * Everything here is pure and local. No model call, no cost, no network.
 */

export type VoiceProfile = {
  /** The greeting word alone, e.g. "Hi". Empty when they do not greet. */
  greeting: string;
  /** What follows the name: ',' '!' or '' — a small but visible habit. */
  greetingPunctuation: string;
  /** How the user signs off, without their name. */
  signOff: string;
  /** Rounded mean words per sentence across their replies. */
  sentenceWords: number;
  /** Rounded mean words in a whole reply. */
  replyWords: number;
  usesContractions: boolean;
  usesExclamations: boolean;
  usesEmDash: boolean;
  usesBullets: boolean;
  /** Short verbatim excerpts to imitate. At most three, trimmed. */
  samples: string[];
  /** How many sent messages this was measured from. Zero means: no evidence. */
  sampleCount: number;
};

export const EMPTY_VOICE: VoiceProfile = {
  greeting: '',
  greetingPunctuation: '',
  signOff: '',
  sentenceWords: 0,
  replyWords: 0,
  usesContractions: false,
  usesExclamations: false,
  usesEmDash: false,
  usesBullets: false,
  samples: [],
  sampleCount: 0,
};

/*
 * A sign-off is the last short line before the name, so both lists stay
 * deliberately small — a long list starts matching ordinary sentences.
 */
const SIGN_OFFS = [
  'thanks', 'thank you', 'thanks so much', 'many thanks', 'cheers', 'best',
  'best regards', 'kind regards', 'regards', 'warm regards', 'all the best',
  'speak soon', 'talk soon', 'take care', 'sincerely', 'yours', 'ta',
];

const GREETINGS = ['hi', 'hey', 'hello', 'dear', 'morning', 'good morning', 'good afternoon', 'yo'];

const CONTRACTIONS =
  /\b(?:i'm|i've|i'll|i'd|it's|that's|don't|doesn't|didn't|can't|won't|isn't|aren't|we're|we'll|you're|you've|there's|let's|here's|they're|wasn't|couldn't|shouldn't|wouldn't)\b/i;

/** Quoted history, forwarded blocks, and the signature after a `--` line. */
export function stripForVoice(body: string): string {
  let text = body.replace(/\r\n/g, '\n');

  // Everything from the first quote marker onward is somebody else's writing.
  const cutters = [
    /^\s*On .{0,120}\bwrote:\s*$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*_{5,}\s*$/m,
    /^\s*From:\s.+$/im,
    /^\s*--\s*$/m,
    /^\s*Sent from my \w+/im,
  ];
  for (const cutter of cutters) {
    const hit = text.match(cutter);
    if (hit?.index !== undefined) text = text.slice(0, hit.index);
  }

  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n')
    .trim();
}

function lines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 1);
}

/** The most frequent entry, or '' when nothing repeats. */
function commonest(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = '';
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** The greeting word and the punctuation after the name, separately. */
function greetingOf(text: string): { word: string; punctuation: string } {
  const first = lines(text)[0];
  if (!first || first.length > 60) return { word: '', punctuation: '' };

  // "Hi Maya," / "Hey Sam!" / "Hello" — the opener, an optional first name,
  // and whatever punctuation closes the line.
  const match = first.match(/^([A-Za-z]+(?: [a-z]+)?)(?:\s+[A-Z][\w'-]*)?\s*([,!.]?)\s*$/);
  const word = (match?.[1] ?? '').trim();
  if (!GREETINGS.includes(word.toLowerCase())) return { word: '', punctuation: '' };
  return { word, punctuation: match?.[2] ?? '' };
}

function signOffOf(text: string): string {
  const all = lines(text);
  // Look at the last few lines: the name usually sits under the sign-off.
  for (const line of all.slice(-3).reverse()) {
    const cleaned = line.replace(/[,!.]+$/, '').trim().toLowerCase();
    if (SIGN_OFFS.includes(cleaned)) return line.replace(/[,!.]+$/, '').trim();
  }
  return '';
}

/**
 * Build a profile from the user's sent messages, most recent first.
 *
 * Bodies that are mostly quoted text contribute nothing and are skipped, so a
 * mailbox of one-line "sounds good" replies on top of long threads does not
 * report an average sentence length of ninety words.
 */
export function profileVoice(sentBodies: string[]): VoiceProfile {
  const usable = sentBodies
    .map(stripForVoice)
    .filter((body) => words(body).length >= 6 && words(body).length <= 400);

  if (!usable.length) return EMPTY_VOICE;

  const allSentences = usable.flatMap(sentences);
  const sentenceWords = allSentences.length
    ? Math.round(allSentences.reduce((sum, s) => sum + words(s).length, 0) / allSentences.length)
    : 0;
  const replyWords = Math.round(
    usable.reduce((sum, body) => sum + words(body).length, 0) / usable.length,
  );

  const joined = usable.join('\n');
  const hits = (pattern: RegExp) => usable.filter((body) => pattern.test(body)).length;

  const greetings = usable.map(greetingOf).filter((g) => g.word);

  return {
    greeting: commonest(greetings.map((g) => g.word)),
    greetingPunctuation: commonest(greetings.map((g) => g.punctuation)),
    signOff: commonest(usable.map(signOffOf).filter(Boolean)),
    sentenceWords,
    replyWords,
    usesContractions: CONTRACTIONS.test(joined),
    // A habit, not a one-off: at least a third of their mail.
    usesExclamations: hits(/!/) * 3 >= usable.length,
    usesEmDash: hits(/—|\s-{2}\s/) * 3 >= usable.length,
    usesBullets: hits(/^\s*[-*•]\s+/m) * 3 >= usable.length,
    samples: usable.slice(0, 3).map((body) => body.slice(0, 600)),
    sampleCount: usable.length,
  };
}

/**
 * The profile as prompt text.
 *
 * Written as observations rather than orders. "This person writes short
 * sentences" survives a draft that needs one longer one; "never exceed 11
 * words" produces clipped, robotic output the moment the content does not fit.
 */
export function describeVoice(voice: VoiceProfile): string {
  if (!voice.sampleCount) {
    return 'No sent mail was available, so nothing is known about how this person writes. Keep the reply plain, short, and free of business-email filler.';
  }

  const notes: string[] = [
    `Measured from ${voice.sampleCount} of their own sent emails.`,
  ];
  if (voice.greeting) {
    notes.push(
      `They open with "${voice.greeting} <first name>${voice.greetingPunctuation}" — that greeting word, the recipient's first name, then "${voice.greetingPunctuation || 'no punctuation'}".`,
    );
  } else {
    notes.push('They usually skip the greeting and start with the first sentence.');
  }

  if (voice.signOff) notes.push(`They sign off with "${voice.signOff}" and then their name.`);
  else notes.push('They usually end without a sign-off line.');

  notes.push(`Their sentences average ${voice.sentenceWords} words; a whole reply averages ${voice.replyWords} words.`);
  notes.push(voice.usesContractions
    ? "They use contractions (I'm, don't, it's)."
    : 'They write words out in full rather than using contractions.');
  if (voice.usesExclamations) notes.push('They use exclamation marks.');
  else notes.push('They rarely use exclamation marks. Do not add any.');
  if (!voice.usesEmDash) notes.push('They never use em-dashes (—). Do not use one.');
  if (voice.usesBullets) notes.push('They sometimes use bullet points.');
  else notes.push('They write in prose, not bullet points.');

  return notes.join('\n');
}

/*
 * Phrases almost nobody writes unprompted and models reach for constantly.
 * Checked after generation rather than only forbidden in the prompt, because a
 * rule in a prompt is a request and a check is a guarantee.
 */
export const AI_TELLS: Array<{ pattern: RegExp; note: string }> = [
  { pattern: /\bi hope this (?:e-?mail |message )?finds you well\b/i, note: 'hope this finds you well' },
  { pattern: /\bi hope you(?:'re| are) (?:doing )?well\b/i, note: 'hope you are doing well' },
  { pattern: /\bthank you for reaching out\b/i, note: 'thank you for reaching out' },
  { pattern: /\bi wanted to (?:reach out|touch base)\b/i, note: 'wanted to reach out' },
  { pattern: /\bplease do not hesitate to\b/i, note: 'do not hesitate to' },
  { pattern: /\bplease feel free to\b/i, note: 'feel free to' },
  { pattern: /\bas per (?:your|our) (?:request|discussion)\b/i, note: 'as per your request' },
  { pattern: /\bi trust this (?:e-?mail |message )?finds\b/i, note: 'trust this finds' },
  { pattern: /\bit(?:'s| is) worth noting that\b/i, note: "it's worth noting" },
  { pattern: /\bin today's fast-paced\b/i, note: "in today's fast-paced" },
  { pattern: /\bdelve into\b/i, note: 'delve into' },
  { pattern: /\bi appreciate your patience\b/i, note: 'appreciate your patience' },
  { pattern: /\blooking forward to hearing from you (?:soon|at your earliest)\b/i, note: 'looking forward … at your earliest' },
];

/** Which stock phrases a draft contains. Empty is the goal. */
export function findTells(draft: string): string[] {
  return AI_TELLS.filter(({ pattern }) => pattern.test(draft)).map(({ note }) => note);
}

/**
 * Links in the draft that were not in the thread it replies to.
 *
 * A drafted reply is content the user is about to send to a client under their
 * own name, and the thread it was built from is written by someone else. A
 * message that talks the model into adding a link turns the user into the
 * delivery mechanism for it. The model has no business inventing URLs here, so
 * any it does invent are stripped rather than trusted.
 */
export function foreignLinks(draft: string, sourceText: string): string[] {
  const urls = draft.match(/https?:\/\/[^\s<>()"']+/gi) ?? [];
  const source = sourceText.toLowerCase();
  const foreign = urls.filter((url) => !source.includes(url.toLowerCase().replace(/[.,;:]+$/, '')));
  return [...new Set(foreign)];
}
