# Deploying the Dime API to Cloudflare Workers (Paid)

Step by step, from an empty Cloudflare account to a verified production Worker. There is one environment (production, Worker `dime-api`); no staging.

Everything runs from `api/`. The whole backend is this one Worker plus Cloudflare resources: **D1** (database), **R2** (receipt, voice and avatar files), **Workers AI** (voice and receipt OCR), a **Durable Object** (live updates), **Queues**, **Cron Triggers** and **Static Assets** (email images). The Worker signs users in itself (Google ID token to its own sessions). DeepSeek (parsing and the agent) and Brevo (email) are the only outside services. There is no Supabase and no Python backend at runtime.

> Budget: $5/month (Workers Paid). Cloudflare has **no hard spending cap**, so section 9 layers guards (the app's own Workers AI neuron cap, per-user limits, a billing alert, an optional AI Gateway spend limit).

## 0. Prerequisites

- Node 22+, `cd api && npm ci`.
- A Cloudflare account with the **Workers Paid** plan ($5/month). Queues and the higher CPU limit need it. Dashboard: Workers & Pages -> Plans -> Workers Paid.
- API keys: DeepSeek, Brevo (and optionally FavQs).
- A Google Cloud **Web** OAuth client id (the same id the app uses as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`). The Worker accepts Google ID tokens issued for it (comma-separate more ids if you also use Android/iOS client ids).
- Register your `workers.dev` subdomain once (dashboard: Workers & Pages -> Overview). The Worker is then `https://dime-api.<subdomain>.workers.dev`.

## 1. Login

```bash
npx wrangler login          # opens a browser, OAuth to your Cloudflare account
npx wrangler whoami         # confirms the account; note the account id
```

For CI use an API token instead (section 11).

## 2. Create the resources

Names must match `wrangler.jsonc` exactly.

```bash
# D1: users are in India, so ask for the Asia-Pacific location. (Already created: dime-db, id in wrangler.jsonc.)
npx wrangler d1 create dime-db --location apac

# R2 (files: avatars/, receipts/, voice_inputs/)
# R2 must be enabled once in the dashboard (R2 Object Storage -> enable) before this works.
npx wrangler r2 bucket create dime-media

# Queues: ingest and email, each with a dead-letter queue (the consumers reference the DLQs, so create them too).
npx wrangler queues create dime-ingest
npx wrangler queues create dime-ingest-dlq
npx wrangler queues create dime-email
npx wrangler queues create dime-email-dlq
```

What each queue does: `dime-ingest` carries receipt / voice capture jobs (the `jobs` table is the source of truth, the message is only a `{job_id, kind}` pointer; 3 retries then the DLQ). `dime-ingest-dlq` marks the job failed and notifies the user. `dime-email` carries one message per digest email (fan-out from the daily cron; 3 retries then `dime-email-dlq`, which logs `email_digest_dead_lettered`).

If you ever recreate the database, paste its id into `wrangler.jsonc` `d1_databases[0].database_id` (CI refuses to deploy an all-zero placeholder id).

## 3. Non-secret vars

Edit `wrangler.jsonc` `vars`:

| Var | Value |
| --- | --- |
| `GOOGLE_WEB_CLIENT_ID` | The Google Web client id (replace `REPLACE-ME...`). Comma-separated if more than one. Must include the id the app signs in with. |
| `EMAIL_PUBLIC_BASE_URL` | The Worker's public origin, e.g. `https://dime-api.<subdomain>.workers.dev` (replace `REPLACE-ME`). **It is also the base URL of every `/media` link** (avatars, signed receipts and voice), and is baked into unsubscribe links and email image URLs. Set it before the first upload or digest. |
| `EMAIL_FROM` | A sender verified in Brevo, `Dime <hello@yourdomain>` |
| `EMAIL_APP_LINK` | The store link used in emails |
| `CORS_ORIGINS` | Leave empty: the mobile app needs no CORS headers. |
| `WORKERS_AI_WHISPER_MODEL`, `WORKERS_AI_VISION_MODEL` | Voice (`@cf/openai/whisper-large-v3-turbo`) and receipt OCR (`@cf/meta/llama-4-scout-17b-16e-instruct`). Defaults are fine. |
| `AI_DAILY_NEURON_CAP` | Workers AI neurons the whole app may use per UTC day, default `8000`. Workers AI is free up to 10,000 neurons/day (per account) and **billed** above ($0.011 per 1,000 neurons), so uploads answer 429 before that. Counter table `ai_usage`. |
| `AI_USER_DAILY_RECEIPTS` | Receipt scans one user may make per UTC day, default `10`. |
| `AI_USER_DAILY_VOICE` | Voice captures one user may make per UTC day, default `10`. (`AGENT_DAILY_QUESTIONS`, default 5, is the third per-user daily limit; manual entry is unlimited. `GET /api/v1/limits` reports all three.) |
| `AI_GATEWAY_ID`, `CF_ACCOUNT_ID` | Optional, empty by default. With `AI_GATEWAY_ID` the Workers AI calls go through that AI Gateway (logs, spend limit). With both set, DeepSeek goes through the gateway's `deepseek` endpoint too (the gateway must not require authentication). |
| `AI_*` | DeepSeek parsing settings. Defaults are fine. |
| `AGENT_*` | `AGENT_ENABLED` (kill switch: `false` makes every chat answer the `agent_disabled` error; or `wrangler deploy --var AGENT_ENABLED:false`), `AGENT_DAILY_TOKEN_BUDGET` (tokens per user per UTC day, default 200000), `AGENT_DAILY_QUESTIONS` (questions per user per UTC day, default 5; the next one answers 429), `AGENT_MAX_STEPS` (4), `AGENT_TURN_TIMEOUT_SECONDS` (25), `AGENT_LLM_TIMEOUT_SECONDS` (12), `AGENT_MODEL`, `AGENT_MODEL_FALLBACK`. |
| `MAX_RECEIPT_UPLOAD_BYTES`, `MAX_VOICE_UPLOAD_BYTES`, `SIGNED_URL_TTL_SECONDS`, `AVATAR_URL_ALLOWED_HOSTS` | Upload caps (10 MiB / 15 MiB), signed `/media` link lifetime (6 h), avatar hosts. Defaults are fine. |

Bindings (D1 `DB`, R2 `MEDIA`, `AI`, Durable Object `USER_HUB`, queues, crons, assets, rate limits) are already declared in `wrangler.jsonc`; there is nothing else to configure. Then regenerate types: `npm run cf-typegen`.

## 4. Secrets

Secrets are encrypted per Worker. `wrangler secret put` deploys a new version immediately and prompts for the value (never put secrets in `wrangler.jsonc`). Run each once.

| Secret | Required | Notes |
| --- | --- | --- |
| `AUTH_JWT_SECRET` | yes | HS256 key that signs the access tokens (`openssl rand -base64 48`). Without it sign-in and every authenticated route answer 503. Rotating it invalidates the current access tokens only; refresh tokens are random values stored hashed in D1, so apps simply refresh and carry on. |
| `MEDIA_URL_SECRET` | yes | HMAC key of the signed `/media` links for receipts and voice (`openssl rand -base64 48`). Without it those links are `null` and private `/media` reads answer 503. Rotating it invalidates links in flight (6 h). |
| `DEEPSEEK_API_KEY` | yes | Receipt/voice parsing and the agent. |
| `AGENT_MEMORY_SECRET` | for agent follow-ups | HMAC key of the agent's conversation-memory token (`openssl rand -base64 32`). Without it the agent works but answers every question without memory ("and July?" does not work). |
| `BREVO_API_KEY` | for email | Without it emails are logged and skipped. |
| `EMAIL_UNSUBSCRIBE_SECRET` | for email | HMAC key of unsubscribe links (`openssl rand -base64 32`). No fallback exists on purpose: without it emails are skipped. |
| `EMAIL_CRON_SECRET` | for the manual email trigger | Guards `POST /api/v1/internal/email/run`; the route is refused while it is unset. |
| `FAVQS_API_KEY` | optional | Quote of the day in digests. |

```bash
for s in AUTH_JWT_SECRET MEDIA_URL_SECRET DEEPSEEK_API_KEY AGENT_MEMORY_SECRET \
         BREVO_API_KEY EMAIL_UNSUBSCRIBE_SECRET EMAIL_CRON_SECRET FAVQS_API_KEY; do
  npx wrangler secret put "$s"
done
npx wrangler secret list
```

(On a Worker that does not exist yet, `secret put` offers to create it; accept. Or deploy once first, section 6, then set secrets. Until the secrets exist, routes that need them answer 503, which is expected.)

## 5. Database schema

The schema is `migrations/0001_init.sql` (tables, indexes, triggers, the 10 system categories), `0002_auth.sql` (sign-in identities and sessions), `0003_ai_usage.sql` (Workers AI counters), `0005_daily_limits.sql` (per-kind receipt/voice counters) and `0006_recurring_items.sql` (recurring income and subscriptions; the `*/5` cron posts them). Apply them to the remote database before the first deploy and after every new migration file (the deploy workflow does this automatically):

```bash
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 migrations list DB --remote       # what is applied
```

Migrations are applied in filename order and recorded in `d1_migrations`; reruns are no-ops. Never edit an applied file: add `0004_*.sql`.

## 6. First deploy

```bash
cd api
npm run typecheck && npm run lint && npm test
npx wrangler deploy --dry-run --outdir dist     # builds, validates bindings, prints the size
npx wrangler deploy
```

The deploy fails if a queue, bucket or D1 database does not exist (section 2). The first deploy also registers the queue consumers, the two cron triggers (`*/5 * * * *` ingest recovery sweep, `30 2 * * *` = 08:00 IST email digests), applies the Durable Object migration (`UserHub`), and uploads `public/email/*` as static assets.

Smoke test:

```bash
BASE=https://dime-api.<subdomain>.workers.dev
curl -s $BASE/api/v1/health                                          # {"status":"ok"} (no auth)
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/v1/me             # 401 without a token
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/v1/auth/google \
  -H 'content-type: application/json' -d '{"id_token":"not-a-token"}'   # 401/422, never 500
curl -sI $BASE/email/slide-1.png | head -3                           # static asset, 200 image/png
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/v1/realtime       # 426 (needs a WebSocket upgrade)
curl -s -o /dev/null -w "%{http_code}\n" $BASE/media/receipts/x.jpg  # 403 (private media needs a signed link)
```

There is no password sign-in, so a real token comes from the app: sign in with Google in a build pointed at the Worker URL. Then run the device checklist in `docs/rewrite/GO-LIVE.md` (sign-in, receipts, voice, budgets, insights, agent, avatar, email digest, cron sweep, empty DLQ).

To trigger an email run without waiting: `POST /api/v1/internal/email/run {"kind":"weekly"}` with header `X-Email-Cron-Secret`.

Then production: repeat sections 2-5 for the production resources, then `npx wrangler deploy` (top-level config, Worker `dime-api`) and the same smoke test against `https://dime-api.<subdomain>.workers.dev`.

### Optional: custom domain

In `wrangler.jsonc` add, after the domain's zone is on the same Cloudflare account:

```jsonc
"routes": [{ "pattern": "api.example.com", "custom_domain": true }]
```

Then redeploy and set `EMAIL_PUBLIC_BASE_URL` to `https://api.example.com`. Keep `workers.dev` enabled until the app build that uses the new domain is out.

## 7. Rollback

Each deploy is a version. To go back immediately:

```bash
npx wrangler deployments list                 # recent deployments
npx wrangler versions list
npx wrangler rollback                         # previous version
npx wrangler rollback <VERSION_ID> --message "why"
```

Rollback restores code and config but **not** secrets/vars changed since, not queue messages already consumed, and not the database. Migrations are not rolled back; write them additively so the previous code keeps working with them.

Database: **D1 Time Travel** restores the database to any minute in the last 30 days (Paid plan), no setup needed:

```bash
npx wrangler d1 time-travel info DB                       # current bookmark
npx wrangler d1 time-travel restore DB --timestamp=2026-10-10T08:00:00Z
```

(Restoring overwrites the live database in place; the command prints the previous bookmark so you can undo it.) R2 has no versioning here: deleted receipts and avatars are gone.

## 8. Observability

- Logs are structured JSON (`{"level","msg","requestId",...}`) with Workers Logs on (`observability.enabled`). Dashboard: Worker -> Logs; filter by `requestId`, `msg` (`ingest_job_failed`, `agent_turn`, ...). `agent_turn` is one line per agent turn: hashed user, tool steps (ms, rows, ok), model calls (tokens incl. `cache_hit_tokens`), `verified` (pass / regenerated / template) and outcome.
- Live: `npx wrangler tail --format pretty` (add `--search <text>` or `--status error`).
- Every response carries `X-Request-ID`; a 500 body includes the same id, so a user report maps straight to a log line.
- Queues: dashboard -> Queues -> each queue shows backlog, consumer errors, DLQ depth. A non-empty `dime-ingest-dlq` means retries were exhausted: read the logged errors.
- Data: `npx wrangler d1 execute DB --remote --command "SELECT status, count(*) FROM jobs GROUP BY status"`.

## 9. Cost guards

Workers Paid is $5/month and includes a large monthly allowance of requests and CPU time, then bills by usage. D1, R2 and Durable Objects have their own free allowances that this app is far below. Layer these guards:

- **Billing alert at $5**: Dashboard -> Notifications -> add a usage-based billing notification, so you are emailed before costs grow. Review Billing -> Usage weekly for the first month.
- **Workers AI** is the only part that can bill for a single misbehaving user: free up to 10,000 neurons/day account-wide, then $0.011 per 1,000. The app stops uploads at `AI_DAILY_NEURON_CAP` (default 8000) and one user at `AI_USER_DAILY_RECEIPTS` / `AI_USER_DAILY_VOICE` (default 10 each). Check the real number in the dashboard (Workers AI -> neurons per day) after the first captures; the per-call estimates in `src/features/ai/neuron-cap.ts` (`ponytail:` comment) are from the published prices and need calibrating.
- **Optional AI Gateway**: create one (dashboard -> AI -> AI Gateway), set its spend limit, put its id in `AI_GATEWAY_ID` (and the account id in `CF_ACCOUNT_ID` to route DeepSeek too). It is the second guard behind the neuron cap and gives request logs.
- **Rate limits** (in `wrangler.jsonc`): `WRITE_LIMITER` 60 requests/minute and `AI_LIMITER` 10/minute per user per location.
- **`limits.cpu_ms: 30000`** caps CPU per invocation.
- Upload caps, the 1 MiB cap on agent bodies (every other JSON body is capped at 64 KB), the 5 questions per user per day, `AGENT_MAX_STEPS` / turn deadline and `AGENT_DAILY_TOKEN_BUDGET` (kill switch `AGENT_ENABLED=false`) bound the DeepSeek spend. DeepSeek (prepaid) and Brevo have their own dashboards.
- Queues: bounded retries (3) then DLQ, so a poison message cannot loop forever.

## 10. Cron triggers

Two crons, both on the Worker's `scheduled()` handler:

- `*/5 * * * *` ingest recovery sweep (re-sends stale `pending` / `processing` jobs).
- `30 2 * * *` (UTC, = 08:00 IST) email digest fan-out: Mondays weekly digests, the 1st monthly ones.

Verify after deploying: dashboard -> Worker -> Settings -> Triggers shows both; `wrangler tail` shows a `sweep` log line at the next 5-minute mark. Locally: `npx wrangler dev --test-scheduled`, then `curl "http://127.0.0.1:8787/__scheduled?cron=*%2F5+*+*+*+*"` (digest: `cron=30+2+*+*+*`).

## 11. CI

`.github/workflows/ci.yml` runs the api, frontend and (reference) Python checks on every push. `.github/workflows/deploy-api.yml` deploys production on every push to `main`: after CI succeeds it applies the D1 migrations (`wrangler d1 migrations apply DB --remote`), deploys, and smoke-tests `/api/v1/health`. It can also be run by hand (Actions -> "Deploy API" -> Run workflow), which runs typecheck, lint and tests first. It refuses to deploy while `wrangler.jsonc` still contains `REPLACE-ME` or the all-zero D1 `database_id`.

Required repository secrets: `CLOUDFLARE_API_TOKEN` (permissions: Workers Scripts Edit, D1 Edit, Workers R2 Storage Edit, Queues Edit, Account Settings Read; the "Edit Cloudflare Workers" template plus D1 and R2) and `CLOUDFLARE_ACCOUNT_ID`. Worker secrets are not touched by CI (they are set once with `wrangler secret put`). The on-demand `agent-evals.yml` needs `EVAL_BASE_URL` and `EVAL_JWT_SECRET` (see its header).

## 12. Frontend / EAS

The app reads `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` at **build time**. The API URL is the **origin only** (no `/api/v1`, no trailing slash): the app's calls already include `/api/v1/...`. The Google client id must be listed in the Worker's `GOOGLE_WEB_CLIENT_ID`.

```bash
cd frontend
npx eas-cli env:create --environment preview    --name EXPO_PUBLIC_API_BASE_URL --value https://dime-api.<subdomain>.workers.dev        --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://dime-api.<subdomain>.workers.dev        --visibility plaintext
npx eas-cli env:create --environment preview    --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <web client id> --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <web client id> --visibility plaintext
npx eas-cli env:list --environment preview
```

There is one API, so `preview` and `production` builds use the same URL. Release builds are HTTPS only (`app.config.js` enables cleartext only for the `development` profile). After changing the API URL you must **rebuild** (`npm run build:android:preview`); an installed app keeps the URL it was built with.
