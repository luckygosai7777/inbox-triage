# Running Owed for Teams (Phase 1, Internal app on getowed.online)

Teams runs on the `teams` branch's Vercel Preview, against its own staging
database. Production (`main`, www.getowed.online) never sees it: every Teams
route and page answers 404 unless `TEAMS_ENABLED=true`.

## 1. Staging database (Supabase, free)
1. New project `owed-teams-staging`, region Singapore (`ap-southeast-1`).
2. SQL Editor, in order: `web/supabase/schema.sql`, `002_background.sql`, `003_teams.sql`.
3. Authentication → Providers → Google: enable it, with the client ID and secret from step 2.

## 2. Internal Google OAuth client (as a getowed.online Workspace admin)
1. Google Cloud Console → new project `owed-teams-internal` under the getowed.online organisation.
2. Enable the **Gmail API**.
3. Google Auth Platform → Audience: **Internal**.
4. Data Access: `openid`, `email`, `profile`, `gmail.readonly`, `gmail.compose`. Nothing else.
5. Clients → Web application → Authorized redirect URI:
   `https://inbox-triage-git-teams-lucky-01ea.vercel.app/auth/callback`

## 3. Vercel environment (Settings → Environment Variables)
Scope every one to **Preview**, Git branch **`teams`** only, never Production:

| Variable | Value |
|---|---|
| `TEAMS_ENABLED` | `true` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | from the staging project |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the Internal client |
| `TOKEN_ENCRYPTION_KEY` | a **new** key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` (never the production one) |
| `CRON_SECRET` | any long random string |

Then redeploy the `teams` branch (push, or Vercel → Deployments → Redeploy).

## 4. Scheduled sync (GitHub Actions)
Repo Settings → Secrets and variables → Actions:
- `TEAMS_SYNC_URL` = `https://inbox-triage-git-teams-lucky-01ea.vercel.app/api/cron/teams-sync`
- `TEAMS_CRON_SECRET` = the `CRON_SECRET` above
- `VERCEL_BYPASS` = Vercel → Settings → Deployment Protection → Protection Bypass for Automation (Preview URLs are protected)

GitHub only runs `schedule` from the default branch, so `.github/workflows/teams-sync.yml`
must also be on `main` for the 15-minute schedule (it does nothing without the secrets).
Until then, use "Run workflow" by hand, or the **Sync now** button.

## 5. Try it
1. Open `https://inbox-triage-git-teams-lucky-01ea.vercel.app/teams` → **Connect my Google Workspace mailbox**.
   The first person from getowed.online becomes the org admin.
2. Connect two or three getowed.online mailboxes, each from its own owner's sign-in.
3. Each owner turns on "Let managers see my client rows" if they agree to.
4. Make yourself a manager or admin in **Admin**, then check **Clients** and **People**.

Phase 1 is done when every row has a quote, "Open in Gmail" finds the message,
and the same client email in several inboxes shows once.
