/**
 * The schema sanitiser, kept honest by the bug that made it necessary.
 *
 * Gemini accepts a subset of JSON Schema, so unsupported keywords are stripped
 * before the request goes out. The first version applied that keyword filter
 * everywhere — including inside `properties`, which is a map of the caller's
 * own field names. Every field was deleted, Gemini received a schema demanding
 * required fields it did not define, and drafting returned nothing at all.
 *
 * Nothing about that was visible from the outside: the key was valid, the
 * model was right, and the button simply did nothing.
 */
import { describe, expect, it } from 'vitest';

import { geminiSchema } from '@/lib/llm';

const DRAFT_SHAPED = {
  type: 'object',
  properties: {
    body: { type: 'string' },
    asks: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['body', 'asks', 'gaps'],
  additionalProperties: false,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
};

describe('geminiSchema', () => {
  it('keeps every field name in properties', () => {
    const out = geminiSchema(DRAFT_SHAPED);
    expect(Object.keys(out.properties)).toEqual(['body', 'asks', 'gaps']);
  });

  it('never leaves a required field undefined in properties', () => {
    const out = geminiSchema(DRAFT_SHAPED);
    for (const field of out.required) {
      expect(out.properties, `required "${field}" must exist`).toHaveProperty(field);
    }
  });

  it('strips the keywords Gemini rejects', () => {
    const out = geminiSchema(DRAFT_SHAPED);
    expect(out).not.toHaveProperty('additionalProperties');
    expect(out).not.toHaveProperty('$schema');
  });

  it('cleans nested schemas without flattening them', () => {
    const out = geminiSchema(DRAFT_SHAPED);
    expect(out.properties.asks).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('leaves enum values alone — they are data, not keywords', () => {
    const out = geminiSchema({
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['Clients', 'required', 'items', 'type'] },
      },
      required: ['category'],
    });
    // 'required', 'items' and 'type' are keyword names, and a filter that does
    // not know the difference would keep them and drop 'Clients'.
    expect(out.properties.category.enum).toEqual(['Clients', 'required', 'items', 'type']);
  });

  it('handles a field whose name collides with a keyword', () => {
    const out = geminiSchema({
      type: 'object',
      properties: { type: { type: 'string' }, items: { type: 'string' } },
      required: ['type', 'items'],
    });
    expect(Object.keys(out.properties)).toEqual(['type', 'items']);
  });

  it('survives an array-of-objects schema', () => {
    const out = geminiSchema({
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, priority: { type: 'integer' } },
            required: ['id'],
            additionalProperties: false,
          },
        },
      },
      required: ['results'],
    });
    expect(Object.keys(out.properties.results.items.properties)).toEqual(['id', 'priority']);
    expect(out.properties.results.items).not.toHaveProperty('additionalProperties');
  });
});

/**
 * Choosing a model.
 *
 * The outage this replaces: GEMINI_MODEL defaulted to the literal string
 * "gemini-2.0-flash", a key that did not serve that exact id got a 404, and
 * there was no way from inside the app to learn what the key *could* serve.
 * The catalogue is now read at runtime and ranked by this function.
 */
import { scoreGeminiModel } from '@/lib/llm';

function best(ids: string[]): string {
  return [...ids]
    .map((id) => ({ id, score: scoreGeminiModel(id) }))
    .filter((m) => m.score >= 0)
    .sort((a, b) => b.score - a.score)[0]!.id;
}

describe('scoreGeminiModel', () => {
  it('rejects models that cannot write a reply', () => {
    for (const id of [
      'text-embedding-004', 'embedding-001', 'aqa', 'imagen-3.0-generate-001',
      'veo-2.0', 'gemini-2.0-flash-live-001', 'gemini-2.5-flash-tts',
    ]) {
      expect(scoreGeminiModel(id), id).toBeLessThan(0);
    }
  });

  it('rejects anything that is not a gemini text model', () => {
    expect(scoreGeminiModel('some-other-model')).toBeLessThan(0);
  });

  it('prefers flash over pro — this workload is high volume, low ambiguity', () => {
    expect(scoreGeminiModel('gemini-2.5-flash')).toBeGreaterThan(scoreGeminiModel('gemini-2.5-pro'));
  });

  it('prefers newer over older within a tier', () => {
    expect(scoreGeminiModel('gemini-2.5-flash')).toBeGreaterThan(scoreGeminiModel('gemini-1.5-flash'));
    expect(scoreGeminiModel('gemini-3.0-flash')).toBeGreaterThan(scoreGeminiModel('gemini-2.5-flash'));
  });

  it('prefers a stable build over a preview or dated one', () => {
    expect(scoreGeminiModel('gemini-2.5-flash')).toBeGreaterThan(
      scoreGeminiModel('gemini-2.5-flash-preview'),
    );
    expect(scoreGeminiModel('gemini-2.5-flash')).toBeGreaterThan(
      scoreGeminiModel('gemini-2.5-flash-001'),
    );
  });

  it('prefers full flash over lite', () => {
    expect(scoreGeminiModel('gemini-2.5-flash')).toBeGreaterThan(
      scoreGeminiModel('gemini-2.5-flash-lite'),
    );
  });

  it('picks something sensible from a realistic catalogue', () => {
    const catalogue = [
      'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-lite',
      'gemini-2.5-flash', 'gemini-2.5-flash-preview-09-2025', 'gemini-2.5-pro',
      'text-embedding-004', 'aqa', 'imagen-3.0-generate-001',
    ];
    expect(best(catalogue)).toBe('gemini-2.5-flash');
  });

  it('still finds a usable model when no flash tier exists', () => {
    expect(best(['gemini-2.5-pro', 'text-embedding-004'])).toBe('gemini-2.5-pro');
  });

  it('copes with a catalogue of names it has never seen', () => {
    // The whole point: a future name must still rank, not crash or be excluded.
    const future = best(['gemini-4.0-flash', 'gemini-3.5-pro', 'embedding-002']);
    expect(future).toBe('gemini-4.0-flash');
  });
});
