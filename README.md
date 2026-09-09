# Inbox Triage

Email management and bulk outreach, built from the design handoff in
`design_handoff_inbox_triage/`. Django + DRF on the back, React (Vite) on the front.

- **Inbox** — mail sorted by reply priority, search by sender/address/topic, VIP briefs, cleanup panel
- **Schedule** — replies packed into the gaps between today's meetings, deadline-first
- **Bulk send** — a four-step composer that opens each message in Gmail for you to send

---

## Quick start

Two terminals. The backend runs on `:8000`, the frontend on `:5173` and proxies `/api` to it.

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env            # then fill in the Google + Anthropic keys
python manage.py migrate
python manage.py runserver 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

### 3. Sign in

Open http://localhost:5173 and click **Continue with Google**. The Google account
*is* the login — the verified email decides which Django user the session belongs to.

**No OAuth credentials yet?** Seed a demo mailbox and use the password form on the
same screen:

```bash
cd backend
python manage.py seed_demo --user demo --password demo --clear
```

Then sign in as `demo` / `demo`. That form only appears while `DJANGO_DEBUG` is on,
and `POST /api/auth/dev-login/` returns 403 when it is off — a deployment with
`DEBUG=False` has no password path into the API at all.

> **Use `localhost`, not `127.0.0.1`.** Browsers scope cookies per host, and the two
> are different hosts. Django's startup banner prints `127.0.0.1:8000`; if you sign in
> there, the session cookie will not reach the app on `localhost:5173`. Stick to
> `localhost` for both.

`seed_demo` loads the same fixtures the prototype used: 10 messages, 8 mailing-list
senders, today's calendar, and a 10-recipient campaign. Everything works against it
except the Gmail-backed actions (sync, archive, trash), which report that no account
is connected rather than failing.

---

## Configuration

All settings read from `backend/.env`; see `backend/.env.example` for the full list.

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client (type: **Web application**) |
| `GOOGLE_REDIRECT_URI` | Must be listed in that client's authorised redirect URIs |
| `GOOGLE_OAUTH_SCOPES` | `gmail.modify` is needed to archive; drop to `gmail.readonly` for sync only |
| `ANTHROPIC_API_KEY` | Leave unset to use an `ant auth login` profile instead |
| `ANTHROPIC_MODEL` | Defaults to `claude-opus-5` |
| `LLM_ENABLED` | `false` forces the deterministic heuristics — useful offline |
| `DORMANT_OPEN_THRESHOLD` | Opens below this inside the window mark a sender dormant (default 2) |
| `CAMPAIGN_BATCH_CAP` / `CAMPAIGN_COOLDOWN_HOURS` | Bulk-send rate limit (default 20 per 6h) |

---

## How the pieces fit

```
backend/
  config/          settings, urls
  accounts/        Google OAuth round trip, credential storage
  inbox/
    models.py      MailMessage, MailThread, Subscription, CalendarSlot, VipSender, SlotAssignment
    services/
      gmail.py     inbox + calendar sync, archive, trash
      llm.py       Claude classification and VIP brief parsing
      parsing.py   header/body/deadline parsing (pure, no network)
      scheduler.py free-gap finding and reply packing
      search.py    ranking
      subscriptions.py  engagement analytics, unsubscribe/blacklist
  campaigns/
    services/
      composer.py  token + AI substitution, Gmail compose links
      csv_import.py
frontend/src/
  api/client.js    fetch wrapper (session cookie + CSRF)
  state/           app context, campaign localStorage
  views/           InboxView, ScheduleView, BulkSendView
  components/      shared primitives + per-view pieces
  styles/global.css  design tokens
```

### Classification

`sync_inbox` upserts messages, then hands anything new to Claude in batches of 10
using structured outputs, so the response is guaranteed-valid JSON. Classification
runs at `effort: "low"` (high-volume, low-ambiguity); brief parsing runs at
`"medium"`. Server-side refusal fallbacks are enabled by default and disable
themselves automatically if the API rejects the beta.

If the model is unavailable, disabled, or declines, every path falls back to
`heuristic_classify` — so sync always completes and the test suite runs offline.

### Deadlines and confidence

The handoff asks the UI to refuse to assert a deadline it isn't sure about, and
that rule is enforced end to end:

- A local date parser (`parsing.extract_deadline`) is the **only** thing that can
  set `due_at`. A match earns **HIGH** confidence and the banner prints the date.
- If only the model thinks there's a deadline, the brief is stored at **LOW**
  confidence with the sentence it read, and the UI shows
  "Mentions a deadline — not confirmed" instead of a time.

### Bulk send

Nothing sends itself. `send-record` is called *after* the browser opens a Gmail
compose tab; it advances the cursor, writes the log entry, and charges the
rate-limit window. Gmail's compose link cannot carry attachments, so the UI lists
the files to attach by hand.

---

## Tests

```bash
cd backend
python manage.py test            # 175 tests
```

Covers deadline extraction and confidence, gap-finding and packing (including
deadline ordering, capacity, overflow and manual pins), search AND-semantics and
ranking, subscription dormancy across windows, CSV import, token/AI substitution,
and the campaign rate limiter. No test touches the network.

```bash
cd frontend
npm run build
```

---

## Deviations from the handoff

Three places where the spec was ambiguous or self-contradictory, and what was built:

1. **`Subscription.status`** — the handoff lists `active/dormant/muted/blacklisted`.
   Dormancy is stored as a *derived* property instead, because the UI lets the user
   switch the activity window (30/90/180 days), so it is a function of
   `(counters, window)` rather than a fixed state. Status is
   `active/unsubscribed/muted`.
2. **Background colour** — the token table names `#111114` as `bg-primary`, but the
   prototype paints the page `#0d0d0f` and uses `#111114` for the nav rail and
   inputs. Both are defined (`--bg-page`, `--bg-primary`) and used as the prototype does.
3. **Rules view** — present in the prototype's nav but not in the handoff's
   "Screens / Views" section or the build tasks, so it is **not built**. The
   backend has no `Rule` model.

## Known limitations

- **Sync is synchronous.** A 50-message sync with classification blocks the request
  for a few seconds. Moving it to Celery/RQ is the obvious next step.
- **Clicks aren't observable** from the Gmail API, so the click counter only rises
  when a user marks one; opens are proxied from read status, dismissals from mail
  archived while unread.
- **Refresh tokens are stored as issued.** Put that column behind field-level
  encryption or a KMS before production.
- **The mail list isn't virtualized.** The handoff asks for virtualization at 10k+
  rows; the list currently pages at 200.
- `gmail.modify` is a restricted scope and needs Google verification for public use.
