# Deploying the Dime API to Cloudflare Workers (Paid)

Step by step, from an empty Cloudflare account to a verified production Worker. Do staging first; production is the same steps with the top-level config instead of `--env staging`.

Everything runs from `api/`. Nothing here needs the Python backend. Supabase stays as the database, Auth and Storage; Cloudflare runs the API, the queues, the cron triggers and the static email images.

> Environments. `wrangler.jsonc` has a production config (top level, Worker `dime-api`) and `env.staging` (Worker `dime-api-staging`). **`env.*` sections do not inherit anything**: queues, Hyperdrive, vars, crons, assets and rate limits are repeated per environment on purpose. Secrets are per Worker, so every secret below is set once per environment (`--env staging` for staging, no flag for production).

## 0. Prerequisites

- Node 22+, `cd api && npm ci`.
- A Cloudflare account with the **Workers Paid** plan ($5/month). Queues, Hyperdrive and the higher CPU limit need it. Dashboard: Workers & Pages -> Plans -> Workers Paid.
- A Supabase project that is reachable (not paused) and the migrations applied (section 6).
- API keys: DeepSeek, Groq, Brevo (and optionally FavQs). The Supabase keys: the **secret** key (`sb_secret_...`, server only), the publishable key, and the legacy JWT secret only if your project still signs HS256 access tokens (new projects sign with asymmetric keys and the Worker reads the public JWKS, no secret needed).
- Register your `workers.dev` subdomain once (dashboard: Workers & Pages -> Overview), it becomes `https://dime-api.<subdomain>.workers.dev`.

## 1. Login

```bash
npx wrangler login          # opens a browser, OAuth to your Cloudflare account
npx wrangler whoami         # confirms the account; note the account id
```

For CI use an API token instead (section 10).

## 2. Create the queues

Eight queues: ingest, its DLQ, email, its DLQ, each for production and staging. Names must match `wrangler.jsonc` exactly. Create the DLQs too; the consumers reference them.

```bash
# production
npx wrangler queues create dime-ingest
npx wrangler queues create dime-ingest-dlq
npx wrangler queues create dime-email
npx wrangler queues create dime-email-dlq
# staging
npx wrangler queues create dime-ingest-staging
npx wrangler queues create dime-ingest-dlq-staging
npx wrangler queues create dime-email-staging
npx wrangler queues create dime-email-dlq-staging
```

What each does: `dime-ingest` carries receipt / voice / SMS capture jobs (the `jobs` table is the source of truth, the message is only a `{job_id, kind}` pointer; 3 retries then the DLQ). `dime-ingest-dlq` marks the job failed and notifies the user. `dime-email` carries one message per digest email (fan-out from the daily cron). `dime-email-dlq` only logs and acks digests that exhausted their retries (the claim is already released).

## 3. Create Hyperdrive (agent SQL)

Hyperdrive gives the AI agent a pooled Postgres connection from Workers. Only `POST /api/v1/agent/chat` uses it; every other route talks to Supabase over HTTPS.

**Which connection string.** Use the **direct connection** string (Supabase dashboard -> Connect -> Direct connection, `postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres`), as Cloudflare's Supabase guide says: Hyperdrive does its own pooling, so do not put another pooler in front of it. If the direct host does not work for you (Supabase direct connections are IPv6 only unless you bought the IPv4 add-on), use the **session pooler** (`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`, port **5432**). **Never use the transaction pooler (port 6543)**: it would stack two transaction-mode poolers over the agent's `set local` statements and prepared statements.

Why session-level behaviour matters: the agent executes each query in ONE `read only` transaction that runs `set_config('request.jwt.claims', ..., true)`, `set local role authenticated` and `set local statement_timeout`, then the query. Hyperdrive pools per transaction and resets the connection afterwards, so nothing leaks to the next user. The database user in the string must be allowed `SET ROLE authenticated`: the `postgres` user is; for a custom user run `grant authenticated to <user>;`.

Create it with caching **disabled**. The agent sends identical SQL text for different users (RLS decides the rows, by the transaction-local claims), so a shared result cache must never be in play. Queries inside transactions are not cached anyway; this is defence in depth.

```bash
npx wrangler hyperdrive create dime-db --connection-string="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" --caching-disabled
# prints an id; for staging, create a second one (dime-db-staging) against the staging project
```

Paste the id into `wrangler.jsonc` (`hyperdrive[0].id`, once for production and once under `env.staging`), replacing `00000000000000000000000000000000`. The `localConnectionString` next to it is only for `wrangler dev`.

## 4. Fill in the non-secret vars

Edit `wrangler.jsonc` (top level **and** `env.staging`; they are separate):

| Var | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<ref>.supabase.co` (no trailing slash) |
| `EMAIL_PUBLIC_BASE_URL` | The Worker's public URL, e.g. `https://dime-api.<subdomain>.workers.dev` (or your custom domain). It is baked into unsubscribe links and email image URLs. Fill it in before the first digest is sent. |
| `EMAIL_FROM` | A sender verified in Brevo, `Dime <hello@yourdomain>` |
| `EMAIL_APP_LINK` | The store link used in emails |
| `CORS_ORIGINS` | Leave empty: the mobile app needs no CORS headers. Only add origins for a web client. |
| `STORAGE_BUCKET` / `PRIVATE_STORAGE_BUCKET` | `Dime` / `Dime-private` unless you renamed the buckets |
| `AI_*`, `GROQ_*` | Defaults are fine; they are the Python backend's values |
| `AGENT_ENABLED` | Kill switch of the AI agent: `false` makes every chat answer the `agent_disabled` error (no model call, no database access). Change it in `wrangler.jsonc` and redeploy (or `wrangler deploy --var AGENT_ENABLED:false`). Default `true`. |
| `AGENT_DAILY_TOKEN_BUDGET` | Tokens (prompt + completion) one user may spend per UTC day, default `200000`; above it the agent answers `daily_limit`. Needs the agent migration (section 6). |
| `AGENT_MAX_STEPS` / `AGENT_TURN_TIMEOUT_SECONDS` / `AGENT_LLM_TIMEOUT_SECONDS` | Tool steps per turn (4), turn deadline (25 s), per model call (12 s). `AGENT_MODEL`, `AGENT_MODEL_FALLBACK`, `AGENT_SQL_TIMEOUT_SECONDS`, `AGENT_SQL_MAX_ROWS` as before. |

Then regenerate types: `npm run cf-typegen`.

## 5. Secrets

Secrets are encrypted per Worker. `wrangler secret put` deploys a new version immediately, and prompts for the value (never put secrets in `wrangler.jsonc`). Run each once per environment; add `--env staging` for staging.

| Secret | Required | Notes |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` | yes | Service-role / secret key. Every DB and Storage call uses it. |
| `SUPABASE_PUBLISHABLE_KEY` | yes | The publishable key. |
| `SUPABASE_JWT_SECRET` | only for HS256 projects | Legacy JWT secret. Omit if the project uses asymmetric signing keys (the JWKS is read from `SUPABASE_URL`). |
| `DEEPSEEK_API_KEY` | yes | SMS/receipt/voice parsing and the agent (function calling, streaming). |
| `GROQ_API_KEY` | yes | Receipt OCR (vision) and Whisper. |
| `BREVO_API_KEY` | for email | Without it emails are logged and skipped. |
| `EMAIL_UNSUBSCRIBE_SECRET` | for email | **Use the same value as the Python backend** so unsubscribe links in emails already sent keep working. No fallback exists on purpose. |
| `EMAIL_CRON_SECRET` | for the manual email trigger | Guards `POST /api/v1/internal/email/run`; the route is refused while it is unset. |
| `FAVQS_API_KEY` | optional | Quote of the day in digests. |
| `AGENT_MEMORY_SECRET` | for agent follow-ups | HMAC key that signs the agent's conversation-memory token (`openssl rand -base64 32`). A NEW secret: do not reuse another. Without it the agent works but answers every question without memory ("and July?" does not work). Rotating it only invalidates the 24 h tokens in flight. |

```bash
for s in SUPABASE_SECRET_KEY SUPABASE_PUBLISHABLE_KEY SUPABASE_JWT_SECRET DEEPSEEK_API_KEY GROQ_API_KEY \
         BREVO_API_KEY EMAIL_UNSUBSCRIBE_SECRET EMAIL_CRON_SECRET FAVQS_API_KEY AGENT_MEMORY_SECRET; do
  npx wrangler secret put "$s" --env staging
done
npx wrangler secret list --env staging
```

(On a Worker that does not exist yet, `secret put` offers to create it; accept. Or deploy once first, section 7, then set secrets. Until the secrets exist, routes that need them answer 503, which is expected.)

## 6. Supabase: migrations and storage (before the first real traffic)

Apply `supabase/migrations/*` **in this order** (CLI: `supabase db push`, or paste each file into the SQL editor). The baseline schema (tables, RLS, `transactions_period_summary`) predates the folder; if you have not run `supabase db pull` yet, do it first and make sure the baseline sorts before `20260816000000_email.sql` (see `supabase/README.md`).

| # | File | Purpose | Risk / notes |
| --- | --- | --- | --- |
| 1 | `20260816000000_email.sql` | `users.email`, `user_settings.weekly_email_enabled` / `monthly_email_enabled`, `email_sends` table (unique `(user_id, kind, period_key)`, RLS on, no policies). | Additive, `if not exists`. Safe. |
| 2 | `20261004000100_private_media_bucket.sql` | Creates the **private** Storage bucket `Dime-private` (receipts, voice) and a policy letting a user read only their own objects. | Must exist before any receipt/voice upload. Bucket allows 15 MB and `image/jpeg,png,webp,heic,heif` + audio types. Old rows keep full public URLs into the old bucket; the API still signs them. Avatars and email images stay in the public `Dime` bucket (create it if it does not exist). |
| 3 | `20261004000200_email_sends_claimed_at.sql` | `email_sends.claimed_at` + partial index, lets the API reclaim a `pending` send older than 30 min. | Additive. Safe. |
| 4 | `20261004000300_notifications_dedupe_unique.sql` | **Deletes duplicate notifications** (keeps the oldest per `(user_id, dedupe_key)`), then a unique index on `(user_id, dedupe_key)`. | Destructive on duplicates only; take a backup first. Index build locks `notifications` writes briefly. |
| 5 | `20261004000400_jobs.sql` | `jobs` table (durable queue state + idempotency keys), RLS on with no policies (service role only). | Additive. Required for receipt / voice / SMS and `Idempotency-Key`. |
| 6 | `20261004000500_update_category_with_budget.sql` | RPC `update_category_with_budget` (atomic category + budget edit), `SECURITY INVOKER`, execute only for `service_role`. | Required for `PATCH /categories/{id}` with `budget_amount`. |
| 7 | `20261004000600_transactions_aggregates.sql` | RPCs `transactions_daily_totals`, `transactions_payee_totals` (SQL-side aggregation). | Optional for correctness (the API falls back to paging rows) but strongly recommended: otherwise a month of data is transferred row by row. Execute only for `service_role`. |
| 8 | `20261004000700_transactions_payment_hash_unique.sql` | NULLs `payment_hash` on duplicate active rows (keeps the oldest; nothing is deleted), then a unique partial index `(user_id, payment_hash)` for active rows. | **Write-locks `transactions` while the index builds**: run at low traffic, then check the row count of NULLed hashes. Required for race-free duplicate capture. |
| 9 | `20261005000100_agent_v2.sql` | AI agent v2: `pg_trgm` (`create extension if not exists pg_trgm with schema extensions`, available on Supabase) with trigram GIN indexes on `transactions.counterparty_name` (partial, active rows) and `categories.name`; the tool functions `agent_payee_key`, `agent_resolve_entities`, `agent_spending_summary`, `agent_category_breakdown`, `agent_top_payees`, `agent_daily_cashflow`, `agent_compare_periods`, `agent_budget_status`, `agent_list_transactions` (SECURITY INVOKER, STABLE, `auth.uid()`, half-open ranges, EXECUTE for `authenticated` only); table `agent_usage` + RPC `agent_usage_add` (daily token budget, service role only); table `agent_feedback` (RLS: insert and select own rows). | **Required for the agent**: without it every tool call fails and the budget check fails open. Additive. The two `CREATE INDEX` statements take a short write lock on `transactions` (a migration cannot use `CONCURRENTLY`): run at low traffic. If the SQL editor or role may not create extensions, enable `pg_trgm` first in Dashboard -> Database -> Extensions. The functions use `search_path = public, extensions`, so they work wherever the extension lives. |

After the last migration, create/confirm Storage buckets in the dashboard: `Dime` (public, avatars) and `Dime-private` (private, created by migration 2).

### Verify in the database (assumptions R1-R4 made; run in the SQL editor)

1. **Tables and columns the code assumes** exist (any missing one fails a specific endpoint):
   ```sql
   select table_name, column_name from information_schema.columns
   where table_schema = 'public' and (table_name, column_name) in (
     ('categories','id'),('categories','user_id'),('categories','name'),('categories','icon_name'),('categories','color'),('categories','is_system'),
     ('category_budgets','user_id'),('category_budgets','category_id'),('category_budgets','monthly_amount'),('category_budgets','updated_at'),
     ('notifications','dedupe_key'),('notifications','deleted_at'),('notifications','created_at'),
     ('transactions','payment_hash'),('transactions','counterparty_normalized'),('transactions','deleted_at'),('users','email'));
   -- expect 17 rows; also confirm unique (user_id, category_id) on category_budgets:
   select indexdef from pg_indexes where tablename = 'category_budgets';
   ```
2. **`transactions_period_summary` exists and is half-open.** The API calls it with `[from, to)` and the Python backend did too. Make sure the function body compares `transaction_at >= p_from and transaction_at < p_to` (not `<=`), otherwise a transaction exactly at midnight is counted in two months:
   ```sql
   select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'transactions_period_summary';
   ```
3. **SECURITY DEFINER grants.** The agent runs SQL as role `authenticated`; no SECURITY DEFINER function that takes a user id may be executable by it (the validator blocks the known names, the grants are the real boundary):
   ```sql
   select p.proname, pg_get_function_identity_arguments(p.oid) as args,
          has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
          has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef;
   -- every row that has a user-id argument must show false / false (revoke from public, anon, authenticated; grant to service_role)
   ```
4. **`category_budgets.monthly_amount` check constraint.** `PATCH /categories/{id}` accepts `budget_amount >= 0` and the RPC upserts it; `PUT /budget/categories/{id}` requires `> 0`. If a check constraint forbids 0 the PATCH with `0` fails at the database:
   ```sql
   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.category_budgets'::regclass;
   ```
   If it is `monthly_amount > 0`, either relax it to `>= 0` or accept that `0` is rejected (the app sends `null` to remove a budget).
5. **RLS on the agent tables**: `transactions`, `categories`, `budgets`, `category_budgets`, `users` have row level security enabled with `user_id = auth.uid()` style policies (the agent returns other users' rows otherwise): `select relname, relrowsecurity from pg_class where relname in (...)`.
6. **`jobs` and `email_sends` have RLS on with no policies** (service role only), and `authenticated` cannot select from them.
7. **Agent v2 grants** (migration 9): `authenticated` may run the `agent_*` tool functions and nothing else of the agent, `anon` and `service_role` may not run them, and only `service_role` may run `agent_usage_add`:
   ```sql
   select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
          has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('service_role', p.oid, 'execute') as service_role
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'agent\_%' order by 1;
   -- agent_usage_add: false / false / true. every other agent_* function: true / false / false.
   select extname, extnamespace::regnamespace from pg_extension where extname = 'pg_trgm';   -- present
   ```

Known limitation: **HEIC/HEIF receipts** are accepted by the upload but Groq vision cannot read them; the app's camera/picker produces JPEG, so this only affects files shared from elsewhere.

## 7. First deploy: staging

```bash
cd api
npm run typecheck && npm run lint && npm test
npx wrangler deploy --dry-run --env staging --outdir dist     # builds, validates bindings, prints the size
npx wrangler deploy --env staging
```

Deploy fails if a queue or the Hyperdrive config does not exist yet (sections 2-3). The first deploy also registers the queue consumers and the two cron triggers (`*/5 * * * *` ingest recovery sweep, `30 2 * * *` = 08:00 IST email digests) and uploads `public/email/*` as static assets.

Smoke test (replace the URL; `TOKEN` = a real user's Supabase access token, see below):

```bash
BASE=https://dime-api-staging.<subdomain>.workers.dev
curl -s $BASE/api/v1/health                       # {"status":"ok"} (no auth)
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/v1/me                # 401 without a token
curl -sI $BASE/email/slide-1.png | head -3         # static asset, 200 image/png
# a token: sign in as a test user against Supabase Auth
TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "content-type: application/json" -d '{"email":"<test user>","password":"<password>"}' | jq -r .access_token)
H="authorization: Bearer $TOKEN"
curl -s $BASE/api/v1/me -H "$H"
```

Then check every flow (also in the app, pointed at the staging URL):

- [ ] `GET /me`, `GET /me/settings`, `PUT /me/profile`
- [ ] Home, transaction list, month summary and insights for this and the previous month
- [ ] Manual create (with and without `Idempotency-Key`; replaying a key returns the same result), edit, delete, detail
- [ ] Categories create / edit (with `budget_amount`) / delete-impact / delete; category budgets and the overall budget
- [ ] Receipt upload -> 202, then a transaction + notification appear within about 30 s (`wrangler tail --env staging` shows `ocr_done`)
- [ ] Voice (m4a) -> transaction; SMS batch -> transactions
- [ ] Agent chat (needs Hyperdrive, the agent migration and `AGENT_MEMORY_SECRET`): "How much did I spend this month?" answers (JSON), and with `-H 'accept: text/event-stream'` streams `step`, `delta` and `final` events; a follow-up ("and last month?") that sends the returned `memory` works; `POST /api/v1/agent/feedback {"turn_id": "<from the response>", "rating": "up"}` answers `{"ok": true}`; with `AGENT_ENABLED=false` the answer is the `agent_disabled` error
- [ ] Notifications list / read / delete, unread count; push token PUT/DELETE
- [ ] `POST /api/v1/internal/email/run {"kind":"weekly"}` with header `X-Email-Cron-Secret` returns `{sent, queued}` and emails arrive
- [ ] Unsubscribe link from a received email opens the confirmation page
- [ ] Kill-resilience: upload a receipt, check `jobs` row goes `pending -> processing -> done`; a stuck job is re-queued by the 5-minute sweep
- [ ] Parity run (README "Parity tooling") against the Python backend, same account

Then production: `npx wrangler deploy` (top-level config, Worker `dime-api`), repeat sections 2-5 for the production resources first, and run the same smoke test against `https://dime-api.<subdomain>.workers.dev`.

### Optional: custom domain

In `wrangler.jsonc` add (top level and/or staging), after the domain's zone is on the same Cloudflare account:

```jsonc
"routes": [{ "pattern": "api.example.com", "custom_domain": true }]
```

Then redeploy and set `EMAIL_PUBLIC_BASE_URL` to `https://api.example.com`. Keep `workers.dev` enabled until the app build that uses the new domain is out.

## 8. Rollback

Each deploy is a version. To go back immediately:

```bash
npx wrangler deployments list                 # recent deployments
npx wrangler versions list
npx wrangler rollback                         # previous version
npx wrangler rollback <VERSION_ID> --message "why"
# staging: add --env staging
```

Rollback restores code and config but **not** secrets/vars changed since, and not queue messages already consumed. Migrations are not rolled back; they are additive, so older code keeps working with them.

## 9. Observability

- Logs are structured JSON (`{"level","msg","requestId",...}`) with Workers Logs on (`observability.enabled`). Dashboard: Worker -> Logs; filter by `requestId`, `msg` (`ingest_job_failed`, `email_digest_dead_lettered`, `agent_turn`, ...). `agent_turn` is one line per agent turn: hashed user, tool steps (ms, rows, ok), model calls (tokens incl. `cache_hit_tokens`), `verified` (pass / regenerated / template) and outcome.
- Live: `npx wrangler tail --env staging --format pretty` (add `--search <text>` or `--status error`).
- Every response carries `X-Request-ID`; a 500 body includes the same id, so a user report maps straight to a log line.
- Queues: dashboard -> Queues -> each queue shows backlog, consumer errors, DLQ depth. A non-empty `dime-ingest-dlq` or `dime-email-dlq` means retries were exhausted: read the logged errors.
- Hyperdrive: dashboard -> Hyperdrive -> metrics (connections, query latency, errors).

## 10. Billing guardrails

Workers Paid is $5/month and includes a large monthly allowance of requests and CPU time, then bills by usage (check the pricing page for current numbers). There is **no hard spending cap**, so layer the guards:

- Dashboard -> Notifications -> add a **usage-based billing / budget alert** so you are emailed before costs surprise you. Review Billing -> Usage in the first weeks.
- **Rate limits** (already in `wrangler.jsonc`): `WRITE_LIMITER` 60 requests/minute and `AI_LIMITER` 10/minute per user per location on mutating and LLM routes. Tune `limit` if real users hit them.
- **`limits.cpu_ms: 30000`** caps CPU per invocation so a runaway loop cannot bill for minutes.
- Upload caps (`MAX_RECEIPT_UPLOAD_BYTES`, `MAX_VOICE_UPLOAD_BYTES`), a 1 MiB cap on agent bodies, the agent's `AGENT_MAX_STEPS` / turn deadline and the per-user `AGENT_DAILY_TOKEN_BUDGET` (kill switch: `AGENT_ENABLED=false`) bound the third-party spend (DeepSeek, Groq, Brevo have their own dashboards: set spend limits there too).
- Queues: bounded retries (3) then DLQ, so a poison message cannot loop forever.

## 11. Cron triggers

Two crons, both on the Worker's `scheduled()` handler:

- `*/5 * * * *` ingest recovery sweep (re-sends stale `pending` / `processing` jobs).
- `30 2 * * *` (UTC, = 08:00 IST) email digest fan-out: Mondays weekly digests, the 1st monthly ones.

Verify after deploying: dashboard -> Worker -> Settings -> Triggers shows both; `wrangler tail --env staging` shows a `sweep` log line at the next 5-minute mark. Locally: `npx wrangler dev --test-scheduled`, then `curl "http://127.0.0.1:8787/__scheduled?cron=*%2F5+*+*+*+*"` (digest: `cron=30+2+*+*+*`). To test email delivery without waiting, use `POST /api/v1/internal/email/run`.

## 12. Frontend / EAS

The app reads `EXPO_PUBLIC_API_BASE_URL` at **build time**. It is the **origin only** (no `/api/v1`, no trailing slash): the app's calls already include `/api/v1/...`.

```bash
cd frontend
# fix the local .env first (it holds the LAN URL): EXPO_PUBLIC_API_BASE_URL=https://dime-api-staging.<subdomain>.workers.dev
npx eas-cli env:create --environment preview    --name EXPO_PUBLIC_API_BASE_URL --value https://dime-api-staging.<subdomain>.workers.dev --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://dime-api.<subdomain>.workers.dev        --visibility plaintext
# (or: edit .env and run `npm run env:push:preview`, which pushes the whole file to the preview environment)
npx eas-cli env:list --environment preview
```

Use the staging URL for `preview` builds until cutover, the production URL for `production`. Release builds (`preview` / `production` EAS profiles) are HTTPS only: `app.config.js` enables `usesCleartextTraffic` / `NSAllowsLocalNetworking` only for the `development` profile (`APP_VARIANT=development`) and local `expo start`. After changing the API URL you must **rebuild** (`npm run build:android:preview`); an installed app keeps the URL it was built with.

## 13. CI

`.github/workflows/ci.yml` runs the api, frontend and backend checks on every push. `.github/workflows/deploy-api.yml` deploys: staging automatically after CI succeeds on `main`, production by hand (Actions -> "Deploy API" -> Run workflow -> `production`). Required repository secrets: `CLOUDFLARE_API_TOKEN` (Workers Edit: use the "Edit Cloudflare Workers" template, plus Queues and Hyperdrive edit, and Account Settings read) and `CLOUDFLARE_ACCOUNT_ID`. Create GitHub **environments** named `staging` and `production`; on `production` enable **required reviewers** so a person approves every production deploy. The workflow refuses to deploy while `wrangler.jsonc` still contains `REPLACE-ME` or the all-zero Hyperdrive id. Worker secrets are not touched by CI (they are set once with `wrangler secret put`).
