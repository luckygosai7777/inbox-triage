# Inbox Triage

**Gmail shows you what arrived. This shows you what you owe.**

Next.js on Vercel, Supabase Postgres, Claude for the reading.

---

## Why this exists

Every inbox tool sorts, filters or summarises what *came in*. None of them read
what *you sent* — which is where your actual obligations live. You write "I'll
get you the deck by Friday" and it vanishes into a sent folder nobody reads
again, including you.

The **Ledger** reads it and gives you one list: everything you owe someone,
ordered by how late it is, each row quoting the sentence it came from.

It fills from two places — promises you made in your own sent mail, and inbound
asks you never replied to — but that is a chip on the row, not a division in the
UI. An earlier version split the screen by source and it was confusing: to the
reader both mean the same thing, so one question took two lists to answer.

Around it sits a triaged inbox, a thread reader, and a calendar-aware schedule
that answers the follow-up: *given what I owe, does today have room for it?*

### Why someone would pay for it

| Tool | What it does | What it misses |
|---|---|---|
| Gmail | Sorts what arrived | No idea what you promised |
| Boomerang | Nags when *nobody replies to you* | The opposite direction |
| Superhuman / Shortwave | Faster triage, AI summaries | Still only inbound |
| SaneBox | Filters noise | No obligations at all |
| **This** | **What you owe, to whom, by when — with the sentence as proof** | |

The differentiator is reading sent mail and being honest about confidence. Every
row quotes its source, and a commitment with no parseable date says *"No date
given"* rather than inventing one. A ledger you cannot trust is a ledger you
stop opening.

---

## Setup

### 1. Supabase

Create a project at [supabase.com](https://supabase.com), then:

1. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
   This creates the tables, indexes, and — critically — the Row Level Security
   policies. **Nothing is secure until this runs.**
2. **Authentication → Providers → Google** → enable, and paste in the client id
   and secret from step 2 below.
3. **Project Settings → API** → copy the URL, anon key and service-role key.

### 2. Google OAuth

In [Google Cloud Console](https://console.cloud.google.com):

1. Enable the **Gmail API** and **Google Calendar API**.
2. **Credentials → Create OAuth client ID → Web application**.
3. Authorised redirect URI:
   `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
4. **OAuth consent screen** → add scopes `gmail.modify` and `calendar.readonly`,
   and add yourself as a test user.

### 3. Local

```bash
cd web
npm install
cp .env.example .env.local     # fill in the values from steps 1 and 2

# Generate the token encryption key:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

npm run dev                    # http://localhost:3000
```

Sign in with Google, then hit **Sync Gmail**. First sync reads your inbox and
recent sent mail, classifies it, and builds the ledger.

### 4. Deploy to Vercel

```bash
npm i -g vercel
cd web
vercel
```

Set **Root Directory** to `web` in the Vercel project settings, add every
variable from `.env.example` under **Settings → Environment Variables**, and set
`APP_URL` to your production URL. Then add
`https://your-app.vercel.app/auth/callback` to Supabase → Authentication → URL
Configuration → Redirect URLs.

---

## Site map

```
Public (indexed, no login)
  /                 landing page — the pitch
  /pricing          Free / Pro / Team
  /privacy          privacy policy  ← required by Google OAuth review
  /terms            terms of service ← required by Google OAuth review
  /login            sign in with Google

Signed in (noindex, gated by middleware)
  /app              inbox — triaged, searchable
  /app/ledger       what you owe
  /app/schedule     reply blocks from your calendar
  /app/settings     connection, export, delete account
  /app/thread/[id]  read a thread, reply via Gmail
```

## Before you can launch

`gmail.modify` is a **restricted scope**. Google reviews it manually, and will
reject an app that does not have all of:

- [x] A public homepage explaining what the app does — `/`
- [x] A privacy policy reachable without logging in — `/privacy`
- [x] Terms of service — `/terms`
- [x] A Limited Use disclosure in the privacy policy — included verbatim
- [ ] **Your real entity name, address and contact email** — search the codebase
      for `TODO` in `src/app/privacy/page.tsx` and `src/app/terms/page.tsx`
- [ ] **A governing jurisdiction** in the terms
- [ ] A demo video showing the OAuth flow and what you do with the data
- [ ] A verified domain in Google Search Console

Expect the review to take a few weeks. Until it passes, the app works for up to
100 test users added in the Google Cloud consent screen.

**Have a lawyer read the legal pages before you take money.** They are a solid
draft, not advice.

## Unit economics — read before changing a price

The dominant cost per user is Anthropic tokens, not hosting. A sync makes three
kinds of call: classification (batched, 10 messages each), commitment extraction
(one per message mined), and VIP briefs.

Rough steady-state cost for one active user, ~30 new messages a day, syncing
daily:

| Route | Calls/day | Model | Cost/month |
|---|---|---|---|
| Classification | ~3 batches | `ANTHROPIC_MODEL_FAST` | ~$2.00 on Opus, ~$0.40 on Haiku |
| Commitment extraction | ~8 | `ANTHROPIC_MODEL` | ~$2.40 |
| VIP briefs | ~3 | `ANTHROPIC_MODEL` | ~$0.90 |
| **Total** | | | **~$5.30 on Opus throughout** |

**₹99 is about $1.20.** On Opus everywhere, one Pro user costs roughly 4× what
they pay. The plan limits and the two-model split exist to close that gap:

- Set `ANTHROPIC_MODEL_FAST=claude-haiku-4-5`. Classification is the high-volume,
  low-ambiguity route and this is where the volume is. Commitment extraction
  stays on the better model, because a wrong answer there becomes a wrong row in
  someone's ledger — which is the whole product.
- Keep the per-sync message caps (25 free, 200 Pro). They are the ceiling on
  what a single user can cost you in a day.
- Sync daily, not hourly. Hourly multiplies the bill by 24 for very little gain.

Even then Pro is thin. Treat ₹99 as a launch price that buys users, and watch
actual per-user token spend in the Anthropic console before scaling it.

Also budget for: Razorpay taking ~2% + ₹3 per transaction (≈5% of a ₹99 charge),
and 18% GST if you are registered.

## Background jobs

The product only works if it runs without you. Two Vercel Crons, declared in
`vercel.json`:

| Schedule | Endpoint | What it does |
|---|---|---|
| Daily 06:00 UTC | `/api/cron/sync` | Syncs the 5 stalest accounts. Skips anything synced in the last 45 min, and disables an account after 5 consecutive failures so a disconnected user is not retried forever. |
| Daily 06:30 UTC | `/api/cron/digest` | Emails users whose chosen digest hour matches. |

> **Vercel Hobby only runs cron jobs once per day**, so these are set daily. The
> digest logic is timezone-aware and designed for an hourly trigger — on Hobby it
> only reaches users whose digest hour lines up with the single daily run. On Pro,
> change both schedules to `0 * * * *` and every user gets it at their own 8am.
> The sync batch size (5 accounts) also assumes hourly; raise it if you stay daily.

Both are protected by `CRON_SECRET` using a constant-time comparison, and
**refuse to run if the secret is unset** rather than executing open.

The digest sends nothing when there is nothing to say. A mail that arrives every
morning reading "you're all clear" teaches people to filter it, and then the one
that mattered is filtered too.

Digests need `RESEND_API_KEY` and `EMAIL_FROM`; without them the job reports
`skipped` rather than failing.

### Why not n8n / Zapier for this

Considered and rejected for the core loop:

- **Multi-tenancy.** Those tools are built around one set of credentials. Every
  user here has their own encrypted Google refresh token, so you would end up
  running one execution per user fed from this database — the automation tool
  becomes a caller of your own API without removing any work.
- **Secrets.** It would need `SUPABASE_SERVICE_ROLE_KEY` and
  `TOKEN_ENCRYPTION_KEY`, putting the two most dangerous values in the system
  into a third-party runtime.
- **Testability.** The sync and extraction logic has 113 tests. Visual nodes have none.

They *are* a good fit for business ops around the product — signup → Slack →
CRM → welcome sequence — where no user credentials are involved.

## Architecture

```
web/
  supabase/schema.sql       tables, indexes, RLS policies  ← run this first
  src/
    middleware.ts           security headers, auth gate, CSRF origin check
    lib/
      crypto.ts             AES-256-GCM for Google refresh tokens
      env.ts                validated environment (server-only)
      supabase.ts           browser / server / admin clients by trust level
      api.ts                route wrapper: auth, Zod validation, rate limits
      parsing.ts            headers, bodies, deadline extraction (pure)
      commitments.ts        the Ledger: extraction, ageing, resolution hints
      llm.ts                Claude calls with prompt-injection defence
      gmail.ts              inbox + SENT sync, calendar, archive, trash
      scheduler.ts          free-gap finding and reply packing
      search.ts             ranking
      composer.ts           bulk-send token substitution
    app/
      page.tsx              landing page
      pricing|privacy|terms marketing and legal
      app/…                 the signed-in product
      api/…                 route handlers
      robots.ts sitemap.ts  SEO
      not-found.tsx error.tsx
```

### The confidence rule

It runs through everything and is the reason to trust the output:

- A local date parser (`parsing.extractDeadline`) is the **only** thing that may
  set a due date.
- A match earns **high** confidence, and the UI prints the date.
- If only the model thinks there is a deadline, the row is stored at **low**
  confidence with the sentence it read, and the UI shows *"unconfirmed"* rather
  than a time.

This is also a security property: a hostile email cannot fabricate a deadline,
because the model is not trusted to set one.

---

## Tests

```bash
cd web
npm test          # 113 tests
npm run typecheck
npm run build
```

Covers digest composition and send-worthiness rules, timezone-aware digest
scheduling, HTML escaping in email, deadline extraction and the confidence rule,
commitment extraction
(including hedge rejection and quoted-text handling), ledger ageing and
ordering, gap-finding and packing, search AND-semantics, and token substitution.
Nothing touches the network.

---

## Security

See **[SECURITY.md](./SECURITY.md)** for the full model. Short version: RLS on
every table, refresh tokens encrypted with AES-256-GCM, service-role key never
in a client bundle, CSP with no `unsafe-inline` for scripts, CSRF origin checks,
Zod on every route, rate limits in Postgres, and a model that cannot trigger
actions or assert deadlines.

`npm audit`: **0 vulnerabilities.**

---

## Run it now, without Supabase

```bash
cd web
npm install
printf 'DEMO_MODE=true
APP_URL=http://localhost:3000
LLM_ENABLED=false
' > .env.local
npm run dev          # http://localhost:3000
```

Demo mode serves fixture data and skips authentication, so the whole product is
clickable before you set anything up. It refuses to run when `NODE_ENV` is
production, so it cannot follow you to Vercel.

## Status

**Working:** landing page, pricing, privacy, terms, auth, sync (inbox + sent),
classification, the Ledger, inbox with search and filters, thread reader with
reply-in-Gmail, schedule with packing, settings with export and account
deletion, 404 and error pages, robots and sitemap, all security controls.

**Not built yet:** bulk-send composer UI (its logic, `composer.ts`, is ported and
tested), subscription cleanup UI, VIP management UI, and billing — the pricing
page sends everyone to the free plan until Stripe is wired in. Database tables
and API routes exist for the first three.
