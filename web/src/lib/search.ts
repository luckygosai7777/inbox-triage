/**
 * Search ranking for the mail list.
 *
 * Every token must hit some field (AND semantics), so "priya invoice" narrows
 * instead of widening. Field weights decide ordering: address and sender beat
 * subject, which beats topic keywords. Word-start matches rank above mid-word
 * ones, so "ray" does not outrank "Raman" on a search for "ram".
 */

export type Searchable = {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  category: string;
  preview: string;
  topics: string;
  priority: number;
  sentAt: Date | string;
};

export type Hit<T> = { item: T; score: number; matchedPerson: boolean };

const PRIORITY_LABELS = ['urgent', 'soon', 'later'];

const WEIGHTS: Array<[keyof Searchable, number]> = [
  ['fromName', 10],
  ['fromEmail', 10],
  ['subject', 6],
  ['category', 4],
  ['preview', 3],
  ['topics', 2],
];

export function tokenize(query: string): string[] {
  return (query ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function boundaryMatch(text: string, token: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(token)}`).test(text);
}

export function scoreItem<T extends Searchable>(item: T, tokens: string[]): Hit<T> | null {
  const fields: Array<[string, number]> = WEIGHTS.map(([key, weight]) => [
    String(item[key] ?? '').toLowerCase(),
    weight,
  ]);
  fields.push([PRIORITY_LABELS[item.priority] ?? 'later', 2]);

  const personFields = new Set([
    String(item.fromName ?? '').toLowerCase(),
    String(item.fromEmail ?? '').toLowerCase(),
  ]);

  let total = 0;
  let matchedPerson = false;

  for (const token of tokens) {
    let best = 0;
    let bestText: string | null = null;
    for (const [text, weight] of fields) {
      if (!text.includes(token)) continue;
      const value = weight * (boundaryMatch(text, token) ? 2 : 1);
      if (value > best) {
        best = value;
        bestText = text;
      }
    }
    if (!best) return null; // AND semantics: one miss drops the item
    total += best;
    if (bestText && personFields.has(bestText)) matchedPerson = true;
  }

  return { item, score: total, matchedPerson };
}

export function search<T extends Searchable>(items: T[], query: string): Array<Hit<T>> {
  const tokens = tokenize(query);
  if (!tokens.length) {
    return items.map((item) => ({ item, score: 0, matchedPerson: false }));
  }

  const hits: Array<Hit<T>> = [];
  for (const item of items) {
    const hit = scoreItem(item, tokens);
    if (hit) hits.push(hit);
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.item.priority !== b.item.priority) return a.item.priority - b.item.priority;
    return new Date(b.item.sentAt).getTime() - new Date(a.item.sentAt).getTime();
  });
  return hits;
}
