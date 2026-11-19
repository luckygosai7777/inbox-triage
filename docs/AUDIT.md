# Phase 0 audit: Owed today, and what Owed for Teams needs

Audited 2026-11-19 against `main` at `cf9b094` (live at www.getowed.online).
No code was changed for this audit.

---

## 1. Architecture and stack

| Layer | Today |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript, in `web/` |
| Hosting | Vercel Hobby, region `sin1`. Push to `main` deploys production. |
| Database + auth | Supabase Postgres (`ap-southeast-1`) and Supabase Auth sessions, free tier |
| Google APIs | `googleapis` (Gmail, Calendar) |
| LLM | Anthropic Claude, or Gemini on a paid key only (`lib/llm.ts`) |
| Email out | Resend, for the daily digest only (optional) |
| Scheduled jobs | Vercel Cron, once a day (Hobby limit): `/api/cron/sync`, `/api/cron/digest` |
| Tests | Vitest, 233 tests, none touch the network |

### Data flow

1. **Sign-in.** `/auth/google` sends the browser to Google with `state` + PKCE. Google returns to
   `/auth/callback` on getowed.online. The app exchanges the code, then Supabase issues the session
   from the ID token (`signInWithIdToken`). See `lib/oauth.ts`.
2. **Token.** Google's refresh token is encrypted (AES-256-GCM, `lib/crypto.ts`) and stored in
   `profiles.google_refresh_token_enc`. The database holds only ciphertext.
3. **Sync** (`lib/gmail.ts → syncMailbox`). Runs on the Sync button (capped at 6 an hour) and in
   the daily cron, which syncs the 5 stalest accounts.
   - Lists recent INBOX and SENT message ids with `messages.list`, by label and count
     (`GMAIL_SYNC_MAX_RESULTS`, default 50).
   - Fetches each with `messages.get(format: full)` and parses headers and body (`lib/parsing.ts`).
   - There is **no incremental sync**: no `history.list`, no stored `historyId`, no date-based
     backfill.
4. **Triage and Ledger.** The classifier (LLM or heuristic) labels each message. The Ledger
   (`lib/commitments.ts`) extracts:
   - `owed`: promises the user made, from SENT mail.
   - `awaiting`: inbound asks the user never answered, detected structurally.

   Each row keeps `evidence`, the source sentence (300 characters max). A due date is set only
   when the local date parser matches (`confidence = high`). The model alone never sets one.
5. **Reading and replying.** `/api/thread/[id]` and `/api/draft` fetch the full body **live from
   Gmail** and do not store it. `/api/send` sends through `users.messages.send`, but only when the
   user presses Send.
6. **Isolation.** All 13 tables have Row Level Security on `user_id = auth.uid()`.

---

## 2. OAuth scopes requested today

`openid email profile gmail.readonly gmail.send calendar.readonly`. This set has been live since
2026-11-18; before that it was `gmail.modify`.

- `gmail.modify` and `mail.google.com`: **not requested.** Their only callers were dead code,
  deleted on 2026-11-18.
- ⚠️ **`gmail.send`: requested, and this conflicts with the brief.** The brief describes Owed as
  "drafts only, never sends". That has not been true since 2026-09-15, when an in-app Send button
  shipped. It sends only when the user presses Send; nothing sends automatically. See decision D1.
- `calendar.readonly` (Sensitive) is used by the Schedule screen. The brief doesn't mention it, so
  Teams can leave it out.

**Scope classes:**
- `gmail.readonly` and `gmail.compose`: Restricted, so CASA applies.
- `gmail.send`: Sensitive, no CASA on its own.
- The app is already Restricted because of `gmail.readonly`. Moving from `send` to `compose` adds
  no new tier.

Note that Google's own description of `gmail.compose` is "manage drafts **and send** email". That
is technically broader than `gmail.send`, so the justification has to rest on what the app does
(save drafts only), not on what the scope prevents.

---

## 3. Are full message bodies stored?

**No.**
- `messages` stores headers and metadata, plus `preview`: 220 characters, Gmail's snippet or the
  start of the body.
- `commitments.evidence` stores the quoted sentence (300 characters max).
- Thread and draft views fetch bodies live from Gmail and don't keep them.

⚠️ **The live privacy policy (§8) says "Message data older than 180 days is pruned automatically".
No code does this.** Nothing deletes old rows. Either add a scheduled delete, or change the
policy text before verification. This is a small fix (decision D6).

---

## 4. Refresh tokens

AES-256-GCM, with the key in `TOKEN_ENCRYPTION_KEY` (Vercel env, never in the repo), stored as
ciphertext in `profiles`. **Do not change that key**: it would make the stored tokens
undecryptable. Teams can reuse `lib/crypto.ts` as-is for per-mailbox tokens.

---

## 5. Which LLM provider sees email, and is it safe?

What runs in production today: **none.** No Anthropic key is set, and the Gemini key is ignored
because `GEMINI_PAID_TIER` isn't set. Every path runs the heuristics, and drafting is off.

| Provider / tier | Trains on inputs? | Safe for customer mail? | Cost (rough) |
|---|---|---|---|
| Gemini API **free** tier | Yes: used to improve Google products, and human reviewers may read it | **No.** Blocked in code since 2026-11-18 | free |
| Gemini API **paid** tier | No ("doesn't use your prompts … to improve our products") | Yes | pay per token; Flash-class models are the cheapest of these |
| Anthropic API | No, by default under commercial terms | Yes | $5 prepaid to start. About ₹0.26 per message mined on the careful model, about 5× less on Haiku (see CONTEXT.md) |
| Groq (free or paid) | Its Services Agreement bars training without permission, account-wide. Zero Data Retention can be turned on in the Console | **Likely yes. Verify the agreement text yourself first** | free tier is about 1,000 requests a day per model, too small for team sync. Paid is cheap |

Recommendation:
- **Pilots:** Anthropic Haiku for the volume work and the careful model for extraction, about $5–10 a
  month. Or Gemini paid Flash.
- **Groq:** only if you confirm its agreement, and only with ZDR on. It needs a small adapter in
  `lib/llm.ts`, since it uses an OpenAI-compatible API.
- **Never** a free tier whose terms allow training.

Sources:
- [Gemini API terms](https://aistudio.google.com/docs/terms)
- [Groq retention summary](https://humla.team/blog/groq-data-retention-policy)
- [Which AI APIs train on your data](https://www.developersdigest.tech/blog/which-ai-apis-train-on-your-data)

---

## 6. What can be reused, and what must change for multi-tenancy

**Reuse as-is:**

| Code | What it gives Teams |
|---|---|
| `lib/crypto.ts` | Token encryption |
| `lib/oauth.ts` | Sign-in with state + PKCE (scope list changes) |
| `lib/parsing.ts` | Header and body parsing, quote stripping, the deadline parser (the "never invent deadlines" rule) |
| `lib/commitments.ts` | Extraction and reconciliation, wrapped rather than rewritten |
| `lib/llm.ts` | Provider selection, the untrusted-content fence, schema-constrained output |
| `lib/mime.ts` | RFC 2822 building, needed for `drafts.create` |
| `lib/api.ts` | The route wrapper: auth, Zod, rate limits |
| `middleware.ts` | CSP nonce, CSRF origin check |
| `lib/cron.ts` | Constant-time bearer check |

**Must change or be added:**

| Area | Today | Teams needs |
|---|---|---|
| Tenancy | Rows keyed by `user_id`; RLS `user_id = auth.uid()` | `org_id` on every table; RLS through a `security definer` membership/role check (member, manager, admin) |
| Tokens | One token per user in `profiles` | A `mailboxes` table, one encrypted token per mailbox, with `history_id` and a sync lock |
| Rows | `commitments` (`owed` / `awaiting`) | `ledger_rows` with `client_id`, `owner_member_id`, and direction `we_owe` / `they_owe` / `unanswered_ask`. **`they_owe` is new**: the extractor's promise patterns must also run on inbound external mail |
| Clients | Free-text `counterparty` | A `clients` table keyed by domain, or by full address for free-mail senders |
| External-only | Not distinguished | Skip threads with no participant outside the org's domains |
| Cross-mailbox dedupe | Gmail `threadId` (per mailbox) | Store `Message-ID`, `In-Reply-To` and `References` (**not parsed or stored today**) and correlate on them |
| Sync | `messages.list` by count; once a day | A 30-day backfill (`q: newer_than:30d`), then `history.list` from `historyId`, with backoff and a per-mailbox lock |
| Schedule | Vercel Cron, daily (Hobby limit) | A GitHub Actions schedule (free) calling the existing bearer-protected cron route every 10–15 minutes |
| Replies | `/api/send` (sends) | Per D1: a Gmail **draft** via `drafts.create` |
| Audit | None | An append-only `audit_events` table (insert-only RLS, no update or delete) |
| Views | Personal Inbox/Ledger/Schedule | Member ledger, manager per-client and per-owner views, admin settings |

---

## 7. Decisions needed before Phase 1

- **D1 — Send vs drafts-only.** The brief says never send and never request `gmail.send`. The live
  personal app has a Send button on `gmail.send`. One OAuth client is verified for the union of
  every scope it requests, so we can't keep `send` for personal users and `compose` for Teams
  without justifying both.
  *Recommendation:* go drafts-only everywhere, and replace Send with "Save to Gmail drafts". That
  matches the brief, means one justification, and adds no new scope class. It removes a live
  feature and changes live scopes, so it needs your OK.
- **D2 — Python vs TypeScript.** Everything reusable above is TypeScript, and rewriting it in
  Python means rewriting the extractor, which the brief forbids.
  *Recommendation:* the app stays TypeScript. Python only for standalone tools, such as the
  extraction eval and the ZAP or report scripts.
- **D3 — A Workspace for the Internal app.** An Internal app needs a Google Cloud project owned by
  a Google Workspace org. Do you have a Workspace on getowed.online, or another domain? If not,
  Business Starter is the cheapest way in.
- **D4 — Where Teams data lives.** *Recommendation:* a **second free Supabase project** for Teams
  staging, so Phase 1 migrations never touch production. The personal app's tables stay untouched.
- **D5 — Hosting.** Vercel Hobby forbids commercial use. It's fine for an internal pilot, and the
  plan moves to Vercel Pro ($20 a month) at the first paid seat. Render's free tier sleeps after
  idle, which breaks scheduled sync, so it isn't recommended.
- **D6 — The 180-day pruning claim.** Add the scheduled delete (recommended, about 20 lines plus a
  test), or drop the sentence from the policy.

---

## 8. Open risks this audit touches

- **Google ships a team view** for AI Inbox (risk 1). That argues for building the per-client
  manager rollup first, since it's the thing Google's per-user feature can't do.
- **Trusted-app pilot limits and the 100-user cap** (risk 2). Not testable until D3 is settled.
- **Extraction precision at team scale** (risk 5). The extractor is deliberately narrow today. Its
  `they_owe` patterns are untested on inbound mail, so the Phase 2 eval matters.
