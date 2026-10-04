# Go-live checklist: Dime on Cloudflare Workers

Ordered. Do not skip ahead: each step makes the next one safe. Detail lives in `api/DEPLOY.md` (Cloudflare) and `api/README.md` (parity tooling). The Python backend (`backend/`) stays running as the fallback until step 9.

## 1. Supabase

- [ ] Restore / unpause the project (dashboard -> Restore project). Confirm `https://<ref>.supabase.co/auth/v1/health` answers.
- [ ] Take a backup (dashboard -> Database -> Backups, or `pg_dump`). Migration 4 deletes duplicate notifications and migration 8 NULLs duplicate payment hashes.
- [ ] If the baseline schema is not in `supabase/migrations/` yet, run `supabase db pull` and make its timestamp sort before `20260816000000_email.sql`.
- [ ] Apply `supabase/migrations/*` in filename order (`supabase db push`, or paste each file into the SQL editor): `20260816000000_email`, `20261004000100_private_media_bucket`, `..200_email_sends_claimed_at`, `..300_notifications_dedupe_unique`, `..400_jobs`, `..500_update_category_with_budget`, `..600_transactions_aggregates`, `..700_transactions_payment_hash_unique`. Migration 8 write-locks `transactions` while it builds: run at a quiet time.
- [ ] Storage buckets: `Dime` (public: avatars) and `Dime-private` (private: created by migration 2).
- [ ] Run the "Verify in the database" queries in `api/DEPLOY.md` section 6: assumed tables/columns, `transactions_period_summary` is half-open (`< p_to`), no `authenticated` EXECUTE on SECURITY DEFINER functions with a user-id argument, the `category_budgets.monthly_amount` check constraint, RLS on the agent tables.
- [ ] Rotate the service/secret key if it was ever shared; keep the old Python backend's key in step.

## 2. Cloudflare (staging first)

Follow `api/DEPLOY.md` sections 0-7:

- [ ] Workers Paid plan active; `wrangler login`.
- [ ] 8 queues created (ingest, ingest-dlq, email, email-dlq, each plus `-staging`).
- [ ] Hyperdrive created against the Supabase **direct** (or session-pooler, never 6543) connection string with `--caching-disabled`; ids pasted into `wrangler.jsonc` (both envs).
- [ ] `SUPABASE_URL`, `EMAIL_PUBLIC_BASE_URL`, `EMAIL_FROM`, `EMAIL_APP_LINK` filled in `wrangler.jsonc`; `npm run cf-typegen`.
- [ ] Secrets set per environment (`EMAIL_UNSUBSCRIBE_SECRET` = the Python backend's value).
- [ ] `npx wrangler deploy --env staging`, then the smoke-test checklist (health, sign-in, every flow, email run, cron).
- [ ] Billing alert and rate-limit values reviewed (DEPLOY.md section 10).
- [ ] GitHub: add `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, create the `staging` and `production` environments (reviewers on production) so `deploy-api.yml` works.

## 3. Parity run (Python vs TypeScript, same Supabase project)

Run both backends (`cd backend && uv run python -m uvicorn main:app --port 8000`; staging Worker or `npx wrangler dev` in `api/`), then with a TEST account's access token:

```bash
cd api
npm run parity:validator && npm run parity:tokens && npm run parity:routes      # offline, must be green
PY_BASE_URL=http://127.0.0.1:8000 TS_BASE_URL=https://dime-api-staging.<subdomain>.workers.dev \
  ACCESS_TOKEN=<test user token> npm run parity -- --include-writes --include-agent
```

- [ ] Zero `DIFF` rows (warnings for ordering ties are fine; read each one). Fix, redeploy staging, rerun.
- [ ] Compare timings: the report flags endpoints where TS is more than 2x slower.

## 4. Frontend build and device test

- [ ] Set the EAS environment variable (origin only, no `/api/v1`): `EXPO_PUBLIC_API_BASE_URL=https://dime-api-staging.<subdomain>.workers.dev` for `preview`, the production URL for `production` (DEPLOY.md section 12). Fix the local `.env` before `npm run env:push:preview`.
- [ ] **Native rebuild is required** (new native modules and plugin changes, a JS reload is not enough): `expo-secure-store`, `@react-native-community/netinfo`, the removal of `expo-camera` (camera now comes from `expo-image-picker`), plus the cleartext change in `app.config.js`. `npm run build:android:preview`.
- [ ] Install the preview APK on a real device and test:
  - [ ] Sign in (email and Google), sign out, token persists across restart (secure store)
  - [ ] Home, transactions list, detail with signed receipt / voice URLs, edit and delete
  - [ ] Manual add; replay safety (airplane mode mid-submit, then reconnect: one transaction)
  - [ ] Receipt scan (camera) -> notification -> transaction; a large (> 4 MB) photo works
  - [ ] **Voice capture records m4a** and produces a transaction (no ffmpeg on the server)
  - [ ] SMS import review and batch submit
  - [ ] Agent chat: spend question, a chart answer, a compare-months card
  - [ ] Budgets: overall and per category; category create / edit / delete with reassign
  - [ ] Insights month view; shadows render on cards (Android elevation / iOS shadow)
  - [ ] **Error boundary**: force a render error in a dev build and confirm the fallback screen with retry
  - [ ] **Sticky headers** on long lists (transactions, notifications) stay pinned while scrolling
  - [ ] **Notifications**: swipe to delete / mark read, unread badge, tap a notification deep-links correctly
  - [ ] Offline banner (netinfo): toggle airplane mode, the app shows offline state and recovers
  - [ ] Push notification arrives (permissions screen reachable from Settings)
  - [ ] A forced network failure shows the generic "Can't reach Dime" message, **no LAN-IP developer text** in release
- [ ] Confirm the preview/production build is HTTPS-only: after `npx expo prebuild --platform android` with `EAS_BUILD_PROFILE=production` set, `AndroidManifest.xml` must not contain `usesCleartextTraffic="true"` (a dev build shows it), and an `http://` API URL fails on the device.

## 5. Production Cloudflare

- [ ] Repeat DEPLOY.md sections 2-5 for the **production** resources (queues, Hyperdrive, vars, secrets).
- [ ] Actions -> "Deploy API" -> Run workflow -> `production` (approve in the protected environment), or `npx wrangler deploy`.
- [ ] Smoke test against `https://dime-api.<subdomain>.workers.dev` (or your custom domain), plus `EMAIL_PUBLIC_BASE_URL` pointing at it.
- [ ] Run one real digest: `POST /api/v1/internal/email/run {"kind":"weekly"}` with `X-Email-Cron-Secret`, confirm the email and its unsubscribe link.

## 6. Cutover

- [ ] Build `production` with `EXPO_PUBLIC_API_BASE_URL=https://<production worker or custom domain>`, test it on a device against production data, then publish / submit.
- [ ] Keep the Python backend running during the rollout window: older app builds still point at it. Both talk to the same Supabase, so data is shared. Do not run both email tickers: stop the Python email ticker (or the whole Python service) before the first `30 2 * * *` cron on Cloudflare, or users get duplicate digests (the `email_sends` claim prevents most duplicates, but do not rely on it).

## 7. First week of monitoring

- [ ] Daily: Workers dashboard errors and CPU, `wrangler tail --status error` during peak, Queues backlog and **DLQ depth must stay 0** (`dime-ingest-dlq`, `dime-email-dlq`), Hyperdrive errors.
- [ ] Check `jobs` for rows stuck in `pending` / `processing` for more than 10 minutes (the sweep should clear them) and `failed` rows with their `last_error`.
- [ ] Supabase: API latency, database CPU, Storage size (receipts accumulate in `Dime-private`).
- [ ] Spend: Cloudflare usage, DeepSeek, Groq, Brevo dashboards against the budget alerts.
- [ ] Monday 08:00 IST: weekly digests went out and the logs show no `email_digest_failed` spikes. First of the month: monthly digests.
- [ ] Rollback path ready: `npx wrangler rollback` (DEPLOY.md section 8), and the app can be pointed back at the Python backend with a rebuild only if the Worker is unusable.

## 8. Retire the Python backend (after a stable week or two)

- [ ] No traffic on the Python service for several days (its access log is empty except health checks); old app builds are either updated or deliberately cut off.
- [ ] Final parity run archived; `ruff` / `pytest` no longer gate releases.
- [ ] Shut the Python service down. Keep `backend/` in git for a release or two as the behavioural spec, then remove it together with `docs/rewrite/parity-spec.md` references, the `backend` job in `.github/workflows/ci.yml`, and the Heroku/Docker leftovers if any.
- [ ] Remove `workers.dev` access if you moved to a custom domain and every client uses it.
