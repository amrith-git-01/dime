# Go-live checklist: Dime on Cloudflare

Ordered. Each step makes the next one safe. Detail lives in `api/DEPLOY.md` (resources, secrets, deploy, rollback, cost guards). The whole backend is one Cloudflare Worker (D1, R2, Workers AI, a Durable Object, Queues, Cron). The Python `backend/` is reference only and cannot run against it.

All data in the old Supabase project is **test data. Nothing is migrated.** The new database starts empty (plus the 10 system categories).

## 1. Prepare (once)

One environment only: production (Worker `dime-api`). Solo project, no staging.

- [ ] Workers Paid plan active ($5/month); `npx wrangler login`.
- [x] D1 `dime-db` created (APAC) and its id is in `wrangler.jsonc`.
- [x] `GOOGLE_WEB_CLIENT_ID` in `wrangler.jsonc` = the app's `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
- [ ] Enable R2 in the dashboard, then `npx wrangler r2 bucket create dime-media`.
- [ ] Queues: `dime-ingest`, `dime-ingest-dlq`, `dime-email`, `dime-email-dlq` (`api/DEPLOY.md` section 2).
- [ ] Fill `EMAIL_PUBLIC_BASE_URL` (your workers.dev origin) and `EMAIL_FROM` in `wrangler.jsonc`.
- [ ] Secrets (DEPLOY.md section 4): `AUTH_JWT_SECRET`, `MEDIA_URL_SECRET`, `DEEPSEEK_API_KEY`, `AGENT_MEMORY_SECRET`, `BREVO_API_KEY`, `EMAIL_UNSUBSCRIBE_SECRET`, `EMAIL_CRON_SECRET`, optionally `FAVQS_API_KEY`.
- [ ] GitHub repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- [ ] Cost guards: billing alert at $5, optional AI Gateway with a spend limit (DEPLOY.md section 9).

## 2. Deploy

- [ ] Push to `main`: CI -> D1 migrations -> deploy -> health check (`.github/workflows/deploy-api.yml`). Or by hand: `cd api && npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`.
- [ ] Smoke test (DEPLOY.md section 6): health 200, `/me` 401, `/realtime` 426, a private `/media` URL without a signature 403.

## 3. Device test

Build the app against production (`EXPO_PUBLIC_API_BASE_URL` = origin only; DEPLOY.md section 12). **A native rebuild is required** (new auth and WebSocket code, removed Supabase SDK). On a real device:

- [ ] Sign in with Google; the Home screen loads.
- [ ] Restart the app: still signed in (persisted session).
- [ ] Leave it for over 1 hour (access tokens last 1 h), then use the app: the token refreshes silently, no sign-in screen.
- [ ] Sign in on two devices, sign out on one: the other stays signed in for a local sign-out and is signed out by a global one.
- [ ] Receipt scan: a transaction appears and the list updates live, without a manual refresh.
- [ ] **Voice capture records m4a** and produces a transaction, live. (Unverified on Workers AI until now: the first thing to confirm.)
- [ ] A large receipt photo (> 4 MB, up to 10 MB) works.
- [ ] Manual add/edit/delete; replay safety (airplane mode mid-submit: one transaction).
- [ ] Budgets (overall and per category); category create / edit / delete with reassign.
- [ ] Insights month view.
- [ ] Agent chat: a spend question, a chart answer, a follow-up ("and last month?").
- [ ] Avatar upload shows the new image (and keeps showing after a restart).
- [ ] Notifications: list, mark read, delete; push arrives.
- [ ] Email: `POST /api/v1/internal/email/run {"kind":"weekly"}` with `X-Email-Cron-Secret` sends a digest; its unsubscribe link opens the confirmation page.
- [ ] Cron sweep: `npx wrangler tail` shows the `sweep` line every 5 minutes; a `jobs` row stuck in `pending` is re-queued.
- [ ] **DLQs empty**: `dime-ingest-dlq` and `dime-email-dlq` have no backlog in the dashboard.
- [ ] Cost: Workers AI neurons for the day in the dashboard are in line with the app's counter (`SELECT * FROM ai_usage`); recalibrate `src/features/ai/neuron-cap.ts` if not.
- [ ] A forced network failure shows the generic "Can't reach Dime" message.
- [ ] Optional agent quality run against a local `wrangler dev` with `api/evals/seed.sql` (`api/evals/README.md`).

## 4. Cutover

- [ ] Publish the production build (`EXPO_PUBLIC_API_BASE_URL=https://dime-api.<subdomain>.workers.dev`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`).
- [ ] Old app builds point at the old backend and cannot sign in to the new one: update or retire them. There is no data to carry over.

## 5. Retire Supabase (only after the new build is live and working)

- [ ] Confirm at least one device runs the production build against the production Worker and every flow above passed.
- [ ] **Pause** the Supabase project (dashboard -> Settings -> General -> Pause project). Wait a few days; nothing in the new stack talks to it.
- [ ] Then **delete** the project. The data is test data, so there is nothing to export. Also delete the Supabase secrets in GitHub/Railway/Heroku if any remain.
- [ ] Stop the old Python service if one is still running (so it does not send duplicate emails).

## 6. First week of monitoring

- [ ] Daily: Workers dashboard errors and CPU, `wrangler tail --status error` at peak, Queues backlog and **DLQ depth stays 0**.
- [ ] `jobs` rows stuck in `pending` / `processing` for over 10 minutes (the sweep should clear them) and `failed` rows with their `last_error`.
- [ ] Spend: Cloudflare billing (stays at $5), Workers AI neurons/day under 10,000, DeepSeek and Brevo dashboards.
- [ ] Monday 08:00 IST: weekly digests went out; the 1st of the month: monthly digests.
- [ ] Rollback path ready: `npx wrangler rollback` for code, D1 Time Travel for data (DEPLOY.md section 7).
