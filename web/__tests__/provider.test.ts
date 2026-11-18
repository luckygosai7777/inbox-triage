/**
 * Which provider is allowed to see mail.
 *
 * The rule under test: a Gemini key alone is not enough. Free-tier input is
 * used to improve Google's products and may be read by human reviewers, so
 * mail goes to Gemini only once GEMINI_PAID_TIER=true says billing is on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// env() caches its parse, so each case loads a fresh copy of the module.
async function providerWith(vars: Record<string, string>) {
  for (const name of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GEMINI_PAID_TIER', 'AI_PROVIDER', 'LLM_ENABLED']) {
    vi.stubEnv(name, vars[name]); // undefined unsets it
  }
  vi.resetModules();
  const { activeProvider } = await import('@/lib/llm');
  return activeProvider();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('activeProvider', () => {
  it('never picks a Gemini key that is not marked paid', async () => {
    expect(await providerWith({ GEMINI_API_KEY: 'AIza-test' })).toBe('none');
    expect(await providerWith({ GEMINI_API_KEY: 'AIza-test', AI_PROVIDER: 'gemini' })).toBe('none');
  });

  it('picks a paid Gemini key', async () => {
    expect(await providerWith({ GEMINI_API_KEY: 'AIza-test', GEMINI_PAID_TIER: 'true' })).toBe('gemini');
  });

  it('prefers Anthropic when both keys are present', async () => {
    expect(
      await providerWith({ ANTHROPIC_API_KEY: 'sk-ant-test', GEMINI_API_KEY: 'AIza-test', GEMINI_PAID_TIER: 'true' }),
    ).toBe('anthropic');
  });

  it('answers none when switched off', async () => {
    expect(await providerWith({ ANTHROPIC_API_KEY: 'sk-ant-test', LLM_ENABLED: 'false' })).toBe('none');
  });
});
