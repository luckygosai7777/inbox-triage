/**
 * Environment validation.
 *
 * Every secret is read through here so a missing or malformed value fails at
 * boot with a clear message, rather than at 3am inside a request handler. The
 * split between server and public is enforced: anything not prefixed with
 * NEXT_PUBLIC_ is unavailable to the browser bundle, and this module is
 * server-only so importing it from a client component is a build error.
 */
import 'server-only';

import { z } from 'zod';

const schema = z.object({
  // --- Supabase -----------------------------------------------------------
  // Optional only so demo mode can boot with no Supabase project. Every
  // real code path still fails loudly if they are missing.
  NEXT_PUBLIC_SUPABASE_URL: z.string().default(''),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default(''),
  // Bypasses Row Level Security. Server-side only, never in a client bundle.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),

  // --- Google -------------------------------------------------------------
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),

  // --- Claude -------------------------------------------------------------
  ANTHROPIC_API_KEY: z.string().default(''),
  // Used where judgement matters: commitment extraction and VIP briefs.
  ANTHROPIC_MODEL: z.string().default('claude-opus-5'),
  // Used for inbox classification, which is high-volume and low-ambiguity.
  // Defaults to the same model; set it to a cheaper one to cut the per-user
  // cost of a sync roughly fivefold. See README -> Unit economics.
  ANTHROPIC_MODEL_FAST: z.string().default(''),
  LLM_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false'),

  // --- App ----------------------------------------------------------------
  TOKEN_ENCRYPTION_KEY: z.string().default(''),
  DEMO_MODE: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // --- Tuning -------------------------------------------------------------
  GMAIL_SYNC_MAX_RESULTS: z.coerce.number().int().min(1).max(500).default(50),
  SCHEDULE_DAY_START: z.coerce.number().min(0).max(24).default(9),
  SCHEDULE_DAY_END: z.coerce.number().min(0).max(24).default(18),
  SCHEDULE_MIN_GAP_MINUTES: z.coerce.number().int().min(5).default(20),
  SCHEDULE_DEFAULT_BLOCK_MINUTES: z.coerce.number().int().min(5).default(30),
  DORMANT_WINDOW_DAYS: z.coerce.number().int().default(90),
  DORMANT_OPEN_THRESHOLD: z.coerce.number().int().min(0).default(2),
  CAMPAIGN_BATCH_CAP: z.coerce.number().int().min(1).max(100).default(20),
  CAMPAIGN_COOLDOWN_HOURS: z.coerce.number().int().min(1).default(6),
});

type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => process.env.NODE_ENV === 'production';
