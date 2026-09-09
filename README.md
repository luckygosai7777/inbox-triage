# Inbox Triage

**Gmail shows you what arrived. This shows you what you owe.**

Live: https://inbox-triage-xi.vercel.app

---

## What it does

Every inbox tool sorts what *came in*. None of them read what *you sent* — which
is where your real obligations live. You write "I'll get you the deck by Friday",
it disappears into a folder nobody opens again, and Friday arrives without you.

This reads that folder. It gives you one list of everything you owe someone,
ordered by how late it is, with the sentence you actually wrote quoted underneath
so you can check the claim rather than trust it.

Around it: a triaged inbox, a thread reader, and a schedule that packs replies
into the real gaps between your meetings — answering the follow-up question,
*given what I owe, does today have room for it?*

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router) on Vercel |
| Database | Supabase Postgres, row-level security on every table |
| Model | Claude (`claude-opus-5`) for classification and extraction |
| Email | Gmail API — read and archive only, **never send** |

## Getting started

Everything lives in **[`web/`](./web)**. Start there:

- **[web/README.md](./web/README.md)** — setup, architecture, deployment, and
  what Google requires before you can launch
- **[web/SECURITY.md](./web/SECURITY.md)** — the security model, control by
  control, with the attack each one stops

Quickest look, no accounts needed:

```bash
cd web
npm install
printf 'DEMO_MODE=true\nAPP_URL=http://localhost:3000\nLLM_ENABLED=false\n' > .env.local
npm run dev          # http://localhost:3000
```

Demo mode serves sample data and skips auth. It refuses to run when `NODE_ENV`
is production, so it cannot follow you to a deploy.

## Repository layout

```
web/     the application — everything lives here
```

Vercel's **Root Directory** is set to `web`.

Earlier implementations (a Django + DRF backend and a Vite SPA) were replaced by
the Next.js app and removed in commit `f40cf03`'s successor. They remain in git
history if you ever want them back:

```bash
git log --all --diff-filter=D -- backend/
git show <commit>:backend/inbox/services/scheduler.py
```

## Status

**Working** — marketing site, pricing, privacy, terms, Google sign-in, Gmail and
calendar sync, LLM classification, the commitment ledger, inbox with search,
thread reader, reply schedule, settings with export and account deletion,
background sync and daily digest, and the full security model.

**Not built yet** — billing (the pricing page sends everyone to the free plan),
bulk-send composer UI, subscription cleanup UI, onboarding for a first-time
empty state.
