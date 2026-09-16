/**
 * GET /api/diagnostics/ai — why is drafting not working?
 *
 * This exists because the same question has been answered by guesswork three
 * times. Drafting touches a provider key, a remote model catalogue, a live
 * Gmail read and a schema-constrained generation, and when it fails the user
 * sees one sentence while every fact needed to explain it sits on a server
 * they cannot reach.
 *
 * So the chain is walked here, step by step, and each step reports what it
 * actually found. A failing step says which one and why; the steps after it
 * are marked skipped rather than silently absent.
 *
 * SAFETY: no step returns a key, a key prefix, or any message content. The
 * probe generation sends a fixed nonsense sentence, never the user's mail.
 */
import { route } from '@/lib/api';
import { activeProvider, probeProvider } from '@/lib/llm';

type Step = {
  name: string;
  status: 'ok' | 'failed' | 'skipped';
  detail: string;
};

export const GET = route(async () => {
  const steps: Step[] = [];
  const env = process.env;

  // 1. Is a key present at all, and in the environment this build can see?
  const hasGemini = Boolean(env.GEMINI_API_KEY?.trim());
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY?.trim());
  steps.push({
    name: 'A provider key is configured',
    status: hasGemini || hasAnthropic ? 'ok' : 'failed',
    detail: hasGemini
      ? `GEMINI_API_KEY is set (${env.GEMINI_API_KEY!.trim().length} characters)`
      : hasAnthropic
        ? `ANTHROPIC_API_KEY is set (${env.ANTHROPIC_API_KEY!.trim().length} characters)`
        : 'Neither GEMINI_API_KEY nor ANTHROPIC_API_KEY is visible to this deployment. If you added one, it needs a redeploy to take effect.',
  });

  // 2. Which one will actually answer?
  const provider = activeProvider();
  steps.push({
    name: 'A provider is selected',
    status: provider === 'none' ? 'failed' : 'ok',
    detail:
      provider === 'none'
        ? `AI_PROVIDER is "${env.AI_PROVIDER ?? 'auto'}" and no matching key is set.`
        : `${provider}${env.AI_PROVIDER ? ` (AI_PROVIDER=${env.AI_PROVIDER})` : ' (chosen automatically)'}`,
  });

  if (provider === 'none') {
    for (const name of ['The model catalogue is readable', 'A model can be chosen', 'The model answers']) {
      steps.push({ name, status: 'skipped', detail: 'No provider to ask.' });
    }
    return { ok: false, provider, steps };
  }

  // 3-5. Everything from here needs the provider itself.
  const probe = await probeProvider();
  steps.push(...probe.steps);

  return {
    ok: steps.every((step) => step.status === 'ok'),
    provider,
    steps,
    // A one-line summary the user can paste without reading JSON.
    summary:
      steps.find((step) => step.status === 'failed')?.detail ??
      'Everything drafting needs is working.',
  };
});

export const maxDuration = 30;
