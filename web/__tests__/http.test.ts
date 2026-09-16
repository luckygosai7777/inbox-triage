/**
 * Reading a response that is not JSON.
 *
 * The bug: a draft request timed out, the platform answered with its own error
 * page instead of the handler's JSON, and `response.json()` threw a
 * SyntaxError. The user saw
 *
 *     Unexpected token 'A', "An error o"... is not valid JSON
 *
 * which describes our parser, not their problem, and points whoever is
 * debugging it at exactly the wrong layer.
 */
import { describe, expect, it } from 'vitest';

import { readJson } from '@/lib/http';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const html = (body: string, status: number) =>
  new Response(body, { status, headers: { 'content-type': 'text/html' } });

describe('readJson', () => {
  it('returns the payload on success', async () => {
    const result = await readJson(json({ draft: 'hello' }));
    expect(result).toEqual({ ok: true, data: { draft: 'hello' } });
  });

  it('uses the API error message when there is one', async () => {
    const result = await readJson(json({ error: 'Gemini is overloaded' }, 503));
    expect(result).toEqual({ ok: false, status: 503, error: 'Gemini is overloaded' });
  });

  it('explains a timeout instead of quoting an HTML page at the user', async () => {
    const result = await readJson(html('An error occurred with this application.', 504));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/took too long/i);
    // The precise thing the old code got wrong.
    expect(result.error).not.toMatch(/Unexpected token|valid JSON/);
  });

  it('handles the exact body that produced the reported error', async () => {
    const result = await readJson(html('An error occurred in the Server Components render.', 500));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/server hit an error \(500\)/i);
  });

  it('names an expired session rather than a parse failure', async () => {
    const result = await readJson(html('Unauthorized', 401));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/session has expired/i);
  });

  it('copes with an empty body', async () => {
    const result = await readJson(new Response('', { status: 502 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/did not respond properly/i);
  });

  it('reports an oversized upload as that, not as a parse error', async () => {
    const result = await readJson(html('Payload too large', 413));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/too large/i);
  });
});
