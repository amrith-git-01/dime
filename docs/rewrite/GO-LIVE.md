# Go-live checklist: Dime on Cloudflare

Ordered. Each step makes the next one safe. Detail lives in `api/DEPLOY.md` (resources, secrets, deploy, rollback, cost guards). The whole backend is one Cloudflare Worker (D1, R2, Workers AI, a Durable Object, Queues, Cron). The Python `backend/` is reference only and cannot run against it.

All data in the old Supabase project is **test data. Nothing is migrated.** The new database starts empty (plus the 10 system categories).

## 1. Prepare (once)

- [ ] Workers Paid plan active ($5/month); `npx wrangler login`.
- [ ] Create the Google Cloud Web OAuth client id (or reuse the existing one) and note it: `GOOGLE_WEB_CLIENT_ID` in the Worker, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in the app. Same value.
- [ ] Create the staging resources and paste the D1 id (`api/DEPLOY.md` section 2): `dime-db-staging`, `dime-media-staging`, the three `-staging` queues.
- [ ] Fill `wrangler.jsonc` (staging block): `GOOGLE_WEB_CLIENT_ID`, `EMAIL_PUBLIC_BASE_URL` (the staging workers.dev origin), `EMAIL_FROM`, `database_id`. Run `npm run cf-typegen`.
- [ ] Set the staging secrets (section 4 of DEPLOY.md): `AUTH_JWT_SECRET`, `MEDIA_URL_SECRET`, `DEEPSEEK_API_KEY`, `AGENT_MEMORY_SECRET`, `BREVO_API_KEY`, `EMAIL_UNSUBSCRIBE_SECRET`, `EMAIL_CRON_SECRET`, optionally `FAVQS_API_KEY`.
- [ ] GitHub: `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets; `staging` and `production` environments (required reviewers on production).
- [ ] Cost guards: billing alert at $5, optional AI Gateway with a spend limit (DEPLOY.md section 9).

## 2. Deploy staging

- [ ] `cd api && npm run typecheck && npm run lint && npm test`.
- [ ] `npx wrangler d1 migrations apply DB --remote --env staging`, then `npx wrangler deploy --env staging`.
- [ ] Smoke test (DEPLOY.md section 6): health 200, `/me` 401, `/realtime` 426, a private `/media` URL without a signature 403.

## 3. Staging device test

Build the preview app against staging (`EXPO_PUBLIC_API_BASE_URL` = origin only; DEPLOY.md section 12). **A native rebuild is required** (new auth and WebSocket code, removed Supabase SDK): `npm run build:android:preview`. On a real device:

- [ ] Sign in with Google; the Home screen loads.
- [ ] Restart the app: still signed in (persisted session).
- [ ] Leave it for over 1 hour (access tokens last 1 h), then use the app: the token refreshes silently, no sign-in screen.
- [ ] Sign in on two devices, sign out on one: the other stays signed in for a local sign-out and is signed out by a global one.
- [ ] Receipt scan: a transaction appears and the list updates live, without a manual refresh.
- [ ] **Voice capture records m4a** and produces a transaction, live. (Unverified on Workers AI until now: the first thing to confirm.)
- [ ] A large receipt photo (> 4 MB, up to 10 MB) works.
- [ ] SMS import review and batch submit.
- [ ] Manual add/edit/delete; replay safety (airplane mode mid-submit: one transaction).
- [ ] Budgets (overall and per category); category create / edit / delete with reassign.
- [ ] Insights month view.
- [ ] Agent chat: a spend question, a chart answer, a follow-up ("and last month?").
- [ ] Avatar upload shows the new image (and keeps showing after a restart).
- [ ] Notifications: list, mark read, delete; push arrives.
- [ ] Email: `POST /api/v1/internal/email/run {"kind":"weekly"}` with `X-Email-Cron-Secret` sends a digest; its unsubscribe link opens the confirmation page.
- [ ] Cron sweep: `npx wrangler tail --env staging` shows the `sweep` line every 5 minutes; a `jobs` row stuck in `pending` is re-queued.
- [ ] **DLQ empty**: `dime-ingest-dlq` has no backlog in the dashboard.
- [ ] Cost: Workers AI neurons for the day in the dashboard are in line with the app's counter (`SELECT * FROM ai_usage`); recalibrate `src/features/ai/neuron-cap.ts` if not.
- [ ] A forced network failure shows the generic "Can't reach Dime" message.
- [ ] Optional agent quality run: load `api/evals/seed.sql` into staging D1 and run `npm run evals` (`api/evals/README.md`).

## 4. Production

- [ ] Create the production resources (`dime-db`, `dime-media`, `dime-ingest`, `dime-ingest-dlq`, `dime-email`), paste the D1 id, fill the top-level vars, set the secrets (DEPLOY.md sections 2-4; use fresh random secrets, not the staging values).
- [ ] Push to `main` (CI -> staging -> production automatically), or Actions -> "Deploy API" -> Run workflow -> `production`, or the two `wrangler` commands by hand. Each path applies the D1 migrations, then deploys.
- [ ] Smoke test against `https://dime-api.<subdomain>.workers.dev`.

## 5. Cutover

- [ ] Build `production` with `EXPO_PUBLIC_API_BASE_URL=https://dime-api.<subdomain>.workers.dev` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, test it on a device, then publish / submit.
- [ ] Old app builds point at the old backend and cannot sign in to the new one: update or retire them. There is no data to carry over.

## 6. Retire Supabase (only after the new build is live and working)

- [ ] Confirm at least one device runs the production build against the production Worker and every flow above passed.
- [ ] **Pause** the Supabase project (dashboard -> Settings -> General -> Pause project). Wait a few days; nothing in the new stack talks to it.
- [ ] Then **delete** the project. The data is test data, so there is nothing to export. Also delete the Supabase secrets in GitHub/Railway/Heroku if any remain.
- [ ] Stop the old Python service if one is still running (so it does not send duplicate emails).

## 7. First week of monitoring

- [ ] Daily: Workers dashboard errors and CPU, `wrangler tail --status error` at peak, Queues backlog and **DLQ depth stays 0**.
- [ ] `jobs` rows stuck in `pending` / `processing` for over 10 minutes (the sweep should clear them) and `failed` rows with their `last_error`.
- [ ] Spend: Cloudflare billing (stays at $5), Workers AI neurons/day under 10,000, DeepSeek and Brevo dashboards.
- [ ] Monday 08:00 IST: weekly digests went out; the 1st of the month: monthly digests.
- [ ] Rollback path ready: `npx wrangler rollback` for code, D1 Time Travel for data (DEPLOY.md section 7).
