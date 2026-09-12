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
