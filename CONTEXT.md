# Owed — project context

Paste this into any AI assistant to bring it up to speed on the project.
Last updated: 2026-09-15 (sending, composing, and themed)

---

## What it is

**Owed** is an email tool built on Gmail. One-line pitch:

> **Gmail shows you what arrived. Owed shows you what you owe.**

Every inbox tool sorts what *came in*. Owed reads what *you sent* — because that
is where obligations actually live. You write "I'll get you the deck by Friday",
it disappears into a Sent folder nobody reopens, and you forget.

### The differentiating feature: the Ledger

One list of everything the user owes someone, ordered by how late it is. Each row
quotes the exact sentence it came from. It fills from two sources:

- **Promises the user made** — extracted from their own sent mail
- **Inbound asks never answered** — detected structurally (the thread's most
  recent message is still inbound)

The source is a small chip on the row, not a division in the UI. An earlier
version split the screen into two columns by source and it confused people: both
mean "someone is waiting", so one question took two lists to answer.

### The confidence rule (important — runs through everything)

A local regex/date parser is the **only** thing permitted to set a due date. A
match earns HIGH confidence and the UI prints the date. If only the language
model thinks there is a deadline, the row is stored at LOW confidence showing the
sentence it read, and the UI says "No deadline given" rather than inventing one.

This is both a product decision (a ledger you cannot trust is one you stop
opening) and a security property (a hostile email cannot fabricate urgency).

### Other screens

- **Inbox** — mail triaged by reply priority, searchable by sender/address/topic
- **Schedule** — replies packed into the real gaps between calendar meetings,
  deadline-first, with per-sender effort estimates
- **Thread reader** — read a thread and reply in place. The composer does
  To/Cc/Bcc, subject, attachments (3 MB/file, 3.5 MB total — Vercel caps a
  request body at 4.5 MB and base64 inflates by a third), and sends through the
  user's own account. Writing by hand is the default; "✦ Draft it in my voice"
  is a button beside it and appends rather than overwrites.
- **Settings** — connection status, JSON export, account deletion

### Hard product constraint

**Nothing sends itself.** The app *can* send — you write or generate a reply,
read it, and press Send, and it leaves from your own Gmail account in the right
thread. What does not exist is any path that reaches your contacts without you:
no scheduled send, no auto-reply, no automation into the send route.

This changed on 2026-09-15. It was previously "cannot send at all", with
replies opening a prefilled Gmail tab. That made the product a viewer of your
mail rather than a place to work in it, and the drafted reply — the whole point
— had to be copied elsewhere to be useful. No new Google permission was needed:
`gmail.modify`, already held for archiving, authorises `users.messages.send`.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Hosting | Vercel (region `sin1` — Singapore, next to the database) |
| Database | Supabase Postgres, region `ap-southeast-1` |
| Auth | Supabase Auth, Google OAuth provider |
| LLM | Anthropic Claude, or Google Gemini on its free tier. `AI_PROVIDER=auto` prefers Anthropic when its key is present. The Gemini model is **discovered at runtime** from the catalogue the key can see — never hardcoded. |
| Email APIs | `googleapis` (Gmail + Calendar) |
| Validation | Zod on every API route |
| Tests | Vitest — 201 tests, none touch the network |
| Transactional email | Resend (optional; digests skip if unconfigured) |

### Repo layout

```
web/                       ← the app. Vercel Root Directory must be set to this
  supabase/schema.sql      13 tables, indexes, RLS policies — run once, first
  supabase/002_background.sql  timezone + digest columns (existing DBs only)
  src/
    middleware.ts          security headers, CSP nonce, CSRF, cheap auth gate
    lib/
      crypto.ts            AES-256-GCM for Google refresh tokens
      env.ts               Zod-validated environment (server-only)
      supabase.ts          browser / server / admin clients, split by trust level
      api.ts               route() wrapper: auth + Zod + rate limit + error shaping
      parsing.ts           headers, bodies, deadline extraction (pure, testable)
      commitments.ts       the Ledger: extraction, ageing, resolution hints
      llm.ts               Claude calls, prompt-injection defence
      gmail.ts             inbox + SENT sync, calendar, archive, trash
      scheduler.ts         free-gap finding, reply packing
      search.ts            ranking (AND semantics, field weights)
      composer.ts          bulk-send token substitution
      digest.ts            daily digest composition
      email.ts             Resend wrapper
      cron.ts              constant-time bearer check for scheduled jobs
    app/
      page.tsx             landing page
      pricing|privacy|terms
      login/
      app/                 the signed-in product (inbox, ledger, schedule,
                           settings, thread/[id])
      api/                 route handlers
      robots.ts sitemap.ts not-found.tsx error.tsx
```

### Routes

```
Public   /  /pricing  /privacy  /terms  /login
App      /app  /app/ledger  /app/schedule  /app/settings  /app/thread/[id]
API      /api/mail  /api/commitments  /api/schedule  /api/sync
         /api/thread/[id]  /api/draft  /api/send  /api/health
         /api/account  /api/export  /api/cron/sync  /api/cron/digest
```

---

## Security model

Layered deliberately; no single control is trusted alone. Full detail in
`web/SECURITY.md`.

1. **Row Level Security on all 13 tables.** Policies compare `user_id` to
   `auth.uid()`. Postgres itself refuses cross-account reads, so an application
   bug becomes an empty result rather than a breach. Anonymous grants revoked.
2. **Google refresh tokens encrypted (AES-256-GCM)** before storage. The
   database only ever holds ciphertext.
3. **Secret partitioning.** Only `NEXT_PUBLIC_*` reaches the browser.
   `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is server-only. Verified: no
   secrets in any client bundle.
4. **Auth from a validated JWT.** `supabase.auth.getUser()`, never
   `getSession()` (which only decodes a cookie the client could edit). The user
   id never comes from a request body — IDOR is impossible by construction.
5. **CSRF** — SameSite=Lax cookies plus an Origin check on all mutating API
   requests.
6. **CSP with a per-request nonce and `strict-dynamic`** — no `unsafe-inline`
   for scripts. Plus HSTS, frame denial, nosniff, referrer policy, permissions
   policy.
7. **Prompt injection** — email bodies are attacker-controlled. Three defences:
   model output can never trigger an action (it only writes to columns);
   structured JSON-schema outputs; content fenced in `<untrusted>` tags with a
   system-prompt instruction that inner instructions are data. Deadlines are
   never taken from the model.
8. **Rate limiting** in Postgres (serverless shares no memory). `/api/sync` is
   capped at 6/hour/user — it is the only endpoint that spends money.
9. **Cron auth** — bearer secret compared in constant time; routes refuse to run
   if `CRON_SECRET` is unset rather than running open.
10. **Generic error responses.** Detail is logged server-side; database errors
    name tables and stack traces name library versions.

`npm audit`: 0 vulnerabilities.

---

## Background jobs

Two Vercel Crons in `web/vercel.json`:

| Schedule | Endpoint | Purpose |
|---|---|---|
| Daily 06:00 UTC | `/api/cron/sync` | Sync the 5 stalest accounts |
| Daily 06:30 UTC | `/api/cron/digest` | Email users whose digest hour matches |

Vercel Hobby only fires cron once per day. The digest logic is timezone-aware and
designed for an hourly trigger — on Pro, change both to `0 * * * *`.

The digest **sends nothing when there is nothing to say**. A mail that arrives
every morning saying "you're all clear" teaches people to filter it.

---

## Pricing (India)

| Plan | Price | Limit |
|---|---|---|
| Free | ₹0 | rules-engine sorting, 50/sync by hand, 10 drafts/month |
| Pro | ₹499/month | model sorting, 100/sync, 60 drafts, auto-sync, digest |
| Studio | ₹1,299/month | 300/sync, 300 drafts, bulk drafting, hourly sync |

### Unit economics — the constraint behind those limits

Cost is dominated by model tokens, not hosting. Per operation, at list price
and ₹88/$:

| | cost |
|---|---|
| sort one message | ₹0.055 |
| mine one for the ledger | ₹0.26 |
| write one draft (Sonnet 5) | ₹0.78 |

Pro runs about **₹290/user/month** of variable cost against ₹499 of revenue.

**The fixed cost that is easy to miss:** Vercel Hobby forbids commercial use, so
the day this takes a rupee it needs Vercel Pro at $20/month. With Supabase that
is ~₹1,850/month standing from the first paying customer. At ₹499 each Pro user
contributes ~₹197 after Razorpay, so fixed costs clear at **eleven paying
users**.

Levers, in order of impact:
- `ANTHROPIC_MODEL_FAST=claude-haiku-4-5` — routes classification (high volume,
  low ambiguity) to a cheaper model. Commitment extraction stays on the careful
  model because a wrong answer there is a wrong row in someone's ledger.
- Per-sync message caps — the ceiling on what one user can cost per day.
- Daily rather than hourly sync.

Also budget ~2.4% for Razorpay, and 18% GST if registered.

---

## Current status

**Live:** https://inbox-triage-xi.vercel.app — deployed, signed in, syncing real Gmail.
**Repo:** github.com/luckygosai7777/inbox-triage (`main`, auto-deploys to Vercel)

### Working end to end
Landing page, pricing, privacy, terms, 404, robots, sitemap. Google OAuth sign-in.
Gmail + Calendar sync. Inbox triage, ledger, schedule, thread reader, settings.
All security controls. Database schema with RLS on 13 tables.

### Configured
| Variable | State |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | set |
| `SUPABASE_SERVICE_ROLE_KEY` | set |
| `TOKEN_ENCRYPTION_KEY` | set — **43 chars, do not "fix" it** (see below) |
| `GOOGLE_CLIENT_ID` | set |
| `GOOGLE_CLIENT_SECRET` | set |
| `ANTHROPIC_API_KEY` | not set — Gemini answers instead |
| `GEMINI_API_KEY` | set — the free-tier provider |
| `CRON_SECRET` | **not set** — background sync and digests do not run |
| `APP_URL` | not set — falls back to VERCEL_PROJECT_PRODUCTION_URL, fine |

### ⚠️ Do not regenerate TOKEN_ENCRYPTION_KEY
It is 43 characters because a trailing `=` was lost in a paste. It still decodes
to a valid 32-byte key and has already encrypted a live Google refresh token.
Changing it makes that token permanently undecryptable and forces every user to
reconnect Google.

### Next steps, roughly in order
1. **Add `ANTHROPIC_API_KEY`** (needs $5 prepaid credit at console.anthropic.com).
   Without it, classification and commitment extraction use pattern matching.
   For cheap testing, also set `ANTHROPIC_MODEL=claude-haiku-4-5` and
   `ANTHROPIC_MODEL_FAST=claude-haiku-4-5` — roughly 5x cheaper.
2. **Add `CRON_SECRET`** — generate with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   Until then `/api/cron/*` returns 503 and nothing runs on a schedule.
3. **Judge the ledger quality** against a real mailbox. The extractor is
   deliberately narrow; if it misses real promises, loosen `PROMISE_PATTERNS` in
   `src/lib/commitments.ts`. If it produces noise, tighten `HEDGE_PATTERNS`.
4. **Onboarding** for a first-run empty ledger.
5. **Billing** (Razorpay) — the pricing page currently sends everyone to Free.
6. **Bulk-send UI, subscription cleanup UI, VIP management UI** — logic exists
   and is tested; screens are not built.

### Blockers before public launch
1. **11 placeholders** (`TODO`, `example.com`) in `privacy/page.tsx` and
   `terms/page.tsx` — real entity name, address, contact email, jurisdiction.
2. **A real domain.** Google verification for the restricted `gmail.modify`
   scope requires proving domain ownership in Search Console, and a
   `*.vercel.app` subdomain cannot be verified. Until then: 100 test users,
   added manually in Google Cloud → Audience → Test users.
3. **Legal review** of the terms and privacy policy.

### Debugging tip learned the hard way
`GET /api/health` (signed in) reports which env vars the *running build* can
see, their length, whether a paste left stray whitespace, which commit is
deployed, and whether the user's Google token is stored and encrypted. It never
returns a value. Check it first when something looks misconfigured.

Also: **a git push does not always trigger a Vercel build.** If the site does
not change, check Deployments — if the top entry is not your commit, it never
ran. An empty commit re-fires it.

## Recent decisions worth not re-litigating

- **Categories are earned, not assigned by elimination.** `Clients` used to be
  the catch-all, so a Google security alert was filed as a client. A person
  -category now requires a human sender (decided from headers: Auto-Submitted,
  X-Auto-Response-Suppress, Feedback-ID, Precedence), and Clients specifically
  requires a work signal or an ask. `Other` carries the residue.
- **An ask is not always a question.** "Send me the file" has no question mark
  and is a stronger demand than "could you send the file?". Imperatives count,
  in the classifier and the Ledger. The Ledger excludes sentences where the
  *sender* is promising, or "I'll send the deck" lands as something they wanted
  from you.
- **First contact counts.** Requiring prior correspondence before calling
  someone a client buried the most valuable mail a freelancer gets.
- **"Make it human" is not in the drafting prompt**, deliberately. It is
  unfalsifiable — the model cannot check output against it — and produces a
  performance of informality. `lib/voice.ts` measures the user's own sent mail
  instead (greeting, sign-off, sentence length, contractions, em-dashes) and
  the prompt gets facts. Stock phrases are matched *after* generation, and any
  URL the model invented is stripped.
- **The Gemini model is never hardcoded.** It is discovered from the catalogue
  the key can see and cached; a 404 re-resolves once. A hardcoded id is a guess
  about a remote list that rots, and the user cannot correct it.

## Conventions worth knowing

- **Demo mode** (`DEMO_MODE=true`, non-production only) runs the whole UI on
  fixture data with no Supabase and no Google account. Refuses to run when
  `NODE_ENV=production`.
- **Middleware does no Supabase work.** It checks only for the *presence* of a
  session cookie — fast, local, cannot fail. Real validation happens in the page
  or route handler. This came from an outage where an SDK throw in middleware
  500'd the entire site including the privacy policy.
- **Comments explain why, not what**, and record decisions that were wrong the
  first time so they are not repeated.
- Tests never touch the network. Every LLM path has a deterministic heuristic
  fallback, so sync completes and tests run offline.
