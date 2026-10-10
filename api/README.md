# Dime API (`api/`)

TypeScript + [Hono](https://hono.dev) on Cloudflare Workers. The whole backend is this one Worker. The HTTP API is compatible with the original Python FastAPI backend in `../backend/` (contracts C1-C8; the Python code is now reference only, it targets Supabase).

## Architecture

| Concern | Where |
| --- | --- |
| Database | **D1** binding `DB`, schema in `migrations/` (`0001_init`, `0002_auth`, `0003_ai_usage`), raw prepared SQL through `core/db.ts` |
| Sign-in | Own Google sign-in: `POST /api/v1/auth/google` checks the Google ID token (audience `GOOGLE_WEB_CLIENT_ID`) and returns HS256 sessions (`AUTH_JWT_SECRET`); `/auth/refresh` rotates refresh tokens, `/auth/sign-out` revokes |
| Files | **R2** binding `MEDIA` (bucket `dime-media`): avatars public, receipts and voice via HMAC-signed `/media/*` links (`MEDIA_URL_SECRET`) |
| Voice / receipt OCR | **Workers AI** binding `AI` (Whisper, Llama 4 Scout) with a daily neuron cap (`AI_DAILY_NEURON_CAP`, `AI_USER_DAILY_CAPTURES`), optional AI Gateway |
| Parsing + agent | DeepSeek (`DEEPSEEK_API_KEY`) |
| Live updates | Durable Object `UserHub` (binding `USER_HUB`), one per user, WebSocket at `GET /api/v1/realtime` |
| Background | Queues `dime-ingest` (+ DLQ `dime-ingest-dlq`) and `dime-email`; crons `*/5 * * * *` (ingest recovery sweep) and `30 2 * * *` (email digest fan-out) |
| Email | Brevo; images from Workers Static Assets (`public/email`, binding `ASSETS`) |
| Limits | Rate limits `WRITE_LIMITER`, `AI_LIMITER`; smart placement near D1 |

## Local development

Requires Node 22+. Deploying: see [`DEPLOY.md`](DEPLOY.md); the ordered go-live list is `../docs/rewrite/GO-LIVE.md`.

```bash
cd api
npm install
cp .dev.vars.example .dev.vars   # fill in the keys
npm run dev                      # wrangler dev -> http://127.0.0.1:8787
```

- Non-secrets live in `wrangler.jsonc` `vars` (replace the `REPLACE-ME` placeholder); `.dev.vars` overrides them locally. Secrets are set with `wrangler secret put NAME`.
- D1, R2, queues, the Durable Object and rate limits run locally in Miniflare (state in `.wrangler/state`). Create the local schema once and after each new migration: `npx wrangler d1 migrations apply DB --local`. Load the agent fixture if you want it: `npx wrangler d1 execute DB --local --file evals/seed.sql`.
- The `AI` binding is `remote: true`: local `wrangler dev` calls the real Workers AI (needs `wrangler login`; counts toward the free allowance). Everything else stays local.
- Sign-in needs `AUTH_JWT_SECRET` and a real Google ID token for `GOOGLE_WEB_CLIENT_ID`; the tests mint tokens themselves (`test/helpers.ts`).
- After editing `wrangler.jsonc` run `npm run cf-typegen` (regenerates `worker-configuration.d.ts`, which is committed).

| Script | Purpose |
| --- | --- |
| `npm run dev` | `wrangler dev` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (typescript-eslint, type-checked) |
| `npm test` | Vitest inside workerd via `@cloudflare/vitest-pool-workers` |
| `npm run cf-typegen` | `wrangler types --strict-vars=false` |
| `npm run deploy` | `wrangler deploy` (use `--env staging` for staging) |
| `npm run parity` / `parity:tokens` / `parity:routes` | Parity tooling against the Python backend (section "Parity tooling") |
| `npm run evals` / `evals:validate` / `evals:generate` | Agent evals against a running API with a real model / fixture check against a database / regenerate the fixtures (`evals/README.md`) |

## Structure

```
src/
  index.ts          default export { fetch, queue, scheduled }
  app.ts            builds the Hono app, mounts feature routers under /api/v1
  core/             cross-cutting infrastructure only (no business logic)
    env.ts          Bindings/Variables types + zod-validated, memoized config (getConfig)
    errors.ts       AppError hierarchy, onError (C8), notFound
    request-id.ts   X-Request-ID middleware + access log line
    logging.ts      structured JSON log (log.info/warn/error), AsyncLocalStorage request id
    auth.ts         requireAuth (Worker-issued HS256 JWT via jose), currentUser(c)
    db.ts           getDb(c) and thin typed helpers over D1 (first / all / run / batch)
    db-errors.ts    unique-violation detection, typed not-found / forbidden errors
    http.ts         fetchJson / fetchWithRetry (timeout, bounded retries, UpstreamError)
    validation.ts   validate(target, schema): zod validator with FastAPI-style 422
    body-limit.ts   limitBody / limitUpload (413)
    cors.ts         CORS only when CORS_ORIGINS is non-empty
    rate-limit.ts   rateLimit('WRITE_LIMITER' | 'AI_LIMITER')
  features/<feature>/
    routes.ts       Hono router: parse/validate, call service, shape response
    schemas.ts      zod schemas (request + response) and inferred types
    service.ts      business logic (pure where possible)
    repository.ts   all D1 access for the feature
test/               Vitest specs (run in workerd)
public/email/       static email images, served as /email/* by Workers Static Assets
```

## Adding a feature

1. Create `src/features/<name>/{routes,schemas,service,repository}.ts`.
2. In `routes.ts` export a `new Hono<AppBindings>()` router. Protect it with `router.use(requireAuth)`; add `rateLimit('WRITE_LIMITER')` on mutating routes and `rateLimit('AI_LIMITER')` on LLM routes (after `requireAuth`).
3. Validate input with `validate('json' | 'query' | 'param', schema)` and read it with `c.req.valid(...)`. Do not use `zValidator` directly (the wrapper produces the FastAPI-compatible 422).
4. Throw `AppError` subclasses (`NotFoundError`, `ConflictError`, `ValidationError`, ...) from services/repositories; never `try/catch` in routes just to map errors. Anything else becomes a 500 `{"detail":"Internal error","request_id"}` (C8).
5. Get the database with `getDb(c)` and pass it (and `user.id`) into services. Always filter by the JWT user id: D1 has no row level security, so every query binds `user_id`.
6. Read config with `getConfig(c.env)`; add new env vars to the zod schema in `core/env.ts`, `wrangler.jsonc` `vars` (both top level and `env.staging`) and `.dev.vars.example`.
7. Mount the router in `src/app.ts` with `api.route('/<name>', router)`.
8. Outbound HTTP (DeepSeek, Brevo, FavQs, Expo) goes through `fetchJson`/`fetchWithRetry`. Do not retry non-idempotent calls unless the provider supports it.
9. Background work: `c.executionCtx.waitUntil(...)` for small fire-and-forget tasks, Queues for anything slow or retryable.
10. Add tests in `test/` (`app.request(path, init, env)` with `makeEnv()`/`signToken()` from `test/helpers.ts`).

## Testing: real local D1 + an outbound HTTP stub

Relational data lives in **D1** (binding `DB`, schema in `migrations/`, applied with `wrangler d1 migrations apply DB [--local|--remote]`). Tests run against a real local D1: `vitest.config.ts` reads `migrations/` (`readD1Migrations`), `test/setup.ts` applies them once per file and `resetDb()` empties every table (system categories stay) and re-seeds the default user before each test. `test/db.ts` has the seed helpers (`seedTransaction`, `seedCategory`, `seedJob`, ...), `rowsOf` / `oneRow` for database-state assertions, and wrappers that break chosen statements (`failingOn(/INSERT INTO jobs/)`, `failingDb('batch')`, `withBeforeExec`, `spyDb`). Every table references `users(id)`, so a test user must exist (`USER_ID` is seeded).

`test/supabase-stub.ts` (the name is historical) replaces `globalThis.fetch` for the **outbound HTTP** that is not in D1 (Brevo, Expo, DeepSeek, FavQs); the Workers AI binding is faked with `FakeAi` (`test/ingest-fixtures.ts`), since miniflare cannot run it (`remoteBindings: false` in `vitest.config.ts`):

```ts
const stub = useSupabaseStub();                       // describe level: fresh stub per test
stub.on('POST', '/v3/smtp/email', () => json({...}));   // route by method + path substring/regex
const res = await call('/api/v1/categories', { method: 'PATCH', json: {...} });   // test/helpers.ts: signs a JWT for USER_ID
expect(stub.last('POST', '/v3/smtp/email').body).toMatchObject({...});
```

Helpers: `json`, `makeCtx()` (collects `waitUntil` promises; pass to `call` as 3rd arg and `await flush()`). Matching is on path only (not host); unmatched requests return a 599.

Conventions: repositories take a `Db` (`core/db.ts`, a thin typed layer over D1: `first` / `all` / `run` / `batch`, no ORM); ids are text uuids made in the Worker, money is integer cents (`decimalToCents` / `formatCents` at the repository boundary), timestamps are `toISOString()` text, booleans 0/1, JSON text. `transactions.payee_key` is computed on write (`payeeKey` in `transactions/dedupe.ts`). `core/db-errors.ts` recognises SQLite unique violations and carries the not-found / forbidden codes of the atomic category + budget write. Media lives in R2 (binding `MEDIA`, `features/media/`): `storage.ts` (`mediaStore(env)`, `uploadMedia`, `downloadMedia`, local HMAC `signMediaUrls`), `routes.ts` (public `GET /media/*`: avatars public + cached, receipts/voice need `?exp&sig`), `refs.ts` (bare keys, Worker URLs and legacy Supabase URLs to keys). The origin of `/media` links is `EMAIL_PUBLIC_BASE_URL`; the secret is `MEDIA_URL_SECRET`. Tests use the real local R2 bucket (cleared per test in `test/setup.ts`). `core/decimal.ts`, `core/timestamps.ts` (`isoUtc`), `core/background.ts` (`defer`), `core/image-format.ts`, `validation.ts` `uuidString`/`unprocessable` are shared helpers. `requireAuth` is idempotent so routers sharing a prefix (`/me`, `/me/settings`, ...) verify the token once.

## Transactions (R2)

- `features/transactions`: list/detail/create/update/delete, home and month summary. `features/insights`: month insights. Shared pieces for R3: `transactions/service.ts` `createTransaction` (payment-hash dedupe + sparse merge, takes `detectedVia`/`receiptUrl`/`voiceUrl`), `features/media/*` (signing, upload, private path builder, magic-byte sniffing), `features/jobs/*` (jobs repository, `Idempotency-Key` parsing, `runIdempotent`), `features/notifications/{emitter,budget-evaluator,after-insert}.ts` (`notifyAfterInsert` is what the queue consumer calls after inserting a captured transaction).
- Aggregates are single `GROUP BY` queries on D1 (`transactions/repository.ts`); daily buckets are cut in TypeScript (`transactions/aggregates.ts`, `core/timezone.ts`) because SQLite has no IANA time zones.
- Timezone math is `core/timezone.ts` (Intl only). Ranges are always half-open `[from, to)` and sent to D1 as UTC instants.
- Money in responses is a 2-decimal string ("480.00"); empty days in daily series are "0", as in Python.
- Post-create budget evaluation, notifications and push run in `waitUntil` (`defer`): the 201 body never depended on them.

## Ingest pipeline: receipt / voice / SMS (R3)

- **Endpoints** (`features/ingest/routes.ts`, mounted at `/transactions`): `POST /receipt` (10 MB), `POST /voice` (15 MB), `POST /sms` (50 messages). All answer 202. Receipt/voice: `limitUpload` (413), `Idempotency-Key` looked up BEFORE the body is read, magic-byte sniff (415; voice also refuses CAF: Whisper cannot read it and there is no ffmpeg), the Workers AI cap (`ai/neuron-cap.ts`: 429 + `Retry-After` until 00:00 UTC when today's neurons plus the estimate pass `AI_DAILY_NEURON_CAP`, or the user made `AI_USER_DAILY_CAPTURES` captures; SMS is exempt), raw file to the PRIVATE R2 prefix, then ONE `jobs` row (`pending`, payload = object path only) and `INGEST_QUEUE.send({job_id, kind})`. SMS inserts the whole batch in one statement (all or nothing) with derived keys `"<key>:<index>"`; a replay rebuilds the per-message result from the existing rows. If the queue send fails after the insert the request still succeeds and the row stays `pending` for the sweep.
- **Consumer** (`features/ingest/consumer.ts`, `queue()` in `index.ts` routes by queue name): per message `claimJob` (conditional pending -> processing, attempts + 1, max 3), download media, AI pipeline, `createTransaction` (server-set `detected_via` scan/voice/sms and receipt/voice path), `notifyAfterInsert`, `markDone {transaction_id}`. Transient errors (AI/upstream 408/429/5xx, network, DB hiccup) on a non-final attempt release the job to `pending` and `message.retry({delaySeconds: 5 | 10 | 30})`; permanent errors or the 3rd attempt `markFailed` (<= 500 chars) + `capture_failed` notification (receipt `scan`, sms `sms`, none for voice) and ack. `dime-ingest-dlq` has its own consumer that fails the job only if still unfinished, notifies, and acks. **Receipt OCR / voice:** the object is read from R2 and sent as bytes (base64 data URL / base64 audio) to Workers AI. Before the call the consumer re-checks the daily cap (over it: permanent failure + the usual capture-failed notification); after a successful call it books the neurons (actual `usage` / audio duration when the answer has it, else an estimate) with one upsert into `ai_usage`. Ingest `max_batch_size` is 5, processed 3 at a time.
- **Recovery sweep** (`features/ingest/sweep.ts`): cron `*/5 * * * *` calls `requeueStaleProcessing` + `listRecoverable` (updated_at older than 120 s, oldest first, 50 per kind) and re-sends the ids. `scheduled()` dispatches on `controller.cron`; `30 2 * * *` is the email-digest fan-out (R4, below).
- **AI** (`features/ai/`): `prompts.ts` (ported verbatim), `workers-ai.ts` (`env.AI.run`: Llama 4 Scout vision OCR and Whisper large-v3-turbo; the recorded audio is sent as-is; errors mapped to Transient/Permanent), `neuron-cap.ts` (neuron estimates, counters, upload and job guards), `deepseek.ts` (JSON mode, `AI_PARSE_FALLBACK` model chain, `AI_TIMEOUT_SECONDS` split across candidates), `parse-output.ts` (normalization + zod validation, port of `_parse_and_validate`), `service.ts` (`parseReceipt` / `parseVoice` / `parseSms`). Errors are `TransientAiError` / `PermanentAiError` with generic messages; provider detail is only logged (S9). The agent (R4) reuses `ai/http.ts` (`aiPost`).
- **DB**: `0001_init.sql` has the unique partial index on `transactions (user_id, payment_hash)` (active rows). `createTransaction` resolves a unique violation to the winning row.
- **Tests**: `test/ingest-*.test.ts` and `test/ai.test.ts` use the outbound-HTTP stub, a real local D1 plus `FakeQueue` / `FakeMessage` (`test/ingest-fixtures.ts`); consumer functions take plain message objects.

## AI agent (v2)

`features/agent/`, design and contract C9 in `../docs/rewrite/agent-v2.md`. The fixed classify -> generate SQL -> reflect -> respond pipeline is gone: the agent is a bounded tool-calling loop over fixed D1 queries (`queries.ts`).

```
POST /api/v1/agent/chat   requireAuth -> AI_LIMITER -> body limit (1 MiB) -> zod -> bad timezone 400
                          -> kill switch (AGENT_ENABLED) -> daily token budget -> turn
turn: pre-pass (no LLM) -> [ DeepSeek call -> tools ]* -> answer -> numeric verification -> blocks + memory
```

- **Pre-pass** (`prepass.ts`, `range.ts`, `tools.ts`): a time hint from the question ("June 2026", "last 7 days", "April to June"; none when a comparison, a day of month or two separate months make it ambiguous) or from the memory, and fuzzy entity resolution with trigram similarity (`trigram.ts`, a TypeScript port of pg_trgm) over the user's payees and categories (`queries.ts` `resolve_entities`: `word_similarity` + `similarity`). A name that matches two payees (or two categories) equally and exactly neither ends the turn with "Did you mean A or B?" and no model call. Matches go to the model as ids, so it can call data tools in its first step.
- **Loop** (`service.ts` `runAgentTurn`): the model (`AGENT_MODEL`, non-thinking, temperature 0, function calling) picks tools; the calls of one step run together (max 3, the rest get an error result) in parallel on D1 (`queries.ts` `executeQueries`). At most `AGENT_MAX_STEPS` (4) tool steps, then the model must answer (`tool_choice: none`, tool list unchanged, so the prefix cache holds). Turn deadline `AGENT_TURN_TIMEOUT_SECONDS` (25 s) and `AGENT_LLM_TIMEOUT_SECONDS` (12 s) per model call, enforced with `AbortSignal` through every fetch; `AGENT_MODEL_FALLBACK` is tried once, only while at least 4 s remain. With tool results in hand, a model failure or the deadline yields the template answer; without any, the C5 error.
- **Tools** (`tools.ts`): zod schemas are the single source of truth (`z.toJSONSchema` -> the `tools` sent to DeepSeek; the model's arguments are validated with the same schema and a failure goes back to the model as the tool result). `resolve_entities`, `spending_summary`, `category_breakdown`, `top_payees`, `daily_cashflow` (<= 40 days), `compare_periods`, `budget_status`, `list_transactions` (<= 20 rows; date, amount, type, payee, category only; never `note`), `aggregate_transactions`. Date arguments are INCLUSIVE local dates (`YYYY-MM-DD`); the queries get half-open UTC instants `[from 00:00, to + 1 day 00:00)` in the user's timezone. Every value is a bound D1 parameter. Results are compact jsonb; money fields come back as a decimal string plus `<key>_display` with Indian grouping (`money.ts`).
- **Prompt** (`prompts.ts`): static system prompt, static tool list, then ONE user message with memory, earlier user questions (<= 3 turns, <= 1.5k chars; client assistant text is never used), the server-resolved block, the NOW block and the question. Tool results are `tool` messages wrapped in `<data tool="...">`.
- **Answer verification** (`verify.ts`): every amount (₹ / Rs / INR, lakh / crore / k), percentage and number >= 1000 in the answer must be one of the numbers in the tool results (commas of either grouping, whole-rupee rounding, shorthand rounded to its precision). On a mismatch the model regenerates ONCE (non-streamed, `tool_choice: none`, told which figures failed); still wrong gives the deterministic template (`template.ts`) built from the last useful tool result. `final.answer` is authoritative.
- **Charts and deep link** (`blocks.ts`): built from the tool results, never from model text: a donut for `category_breakdown` / `top_payees`, a zero-filled cashflow chart for `daily_cashflow`, a `compare_bar` for `compare_periods`; a TransactionsList payee / category / day link for the last call scoped to one payee, category or day (names the turn learned only). Both go through the contract's schema validation (`chart.ts`, `deep-link.ts`).
- **Memory** (`memory.ts`): `memory` = `base64url(payload).base64url(HMAC-SHA256)` signed with `AGENT_MEMORY_SECRET`; payload `{v, user_id, time_range, entities, last_tools, summary <= 300, exp}`, 24 h. Verified for signature, user and expiry; anything else is ignored (the turn runs without memory). Without the secret the feature is off (`memory: ""`).
- **Budget and kill switch** (`usage.ts`): `AGENT_ENABLED=false` answers `agent_disabled`; `agent_usage` (one row per user and UTC day, atomic upsert-increment) holds prompt + completion tokens, and a user at `AGENT_DAILY_TOKEN_BUDGET` (default 200 000) gets `daily_limit`. Recording happens after the response (`waitUntil`); a failed read fails open.
- **Responses** (C9). JSON (default): the C5 `ChatResponse` `{answer, blocks, deep_link}` plus `memory` and `turn_id`. SSE (`Accept: text/event-stream`, Hono `streamSSE`): `step {tool,label}` per tool call, `delta {text}` while the answer streams, then `final` (the JSON response, authoritative) or `error {code,message}`; events are written in order and a client disconnect aborts the turn. Failures are C5 bodies (HTTP 200 `{"error": {"code": "assistant_busy" | "assistant_error" | "agent_failed" | "agent_disabled" | "daily_limit", "message"}}`, or the `error` event); a bad timezone is 400, an unreachable database 503 + `Retry-After` in JSON mode (an `assistant_busy` error event in SSE).
- **Feedback**: `POST /api/v1/agent/feedback {turn_id, rating: "up" | "down", comment?}` upserts one row per (user, turn) into `agent_feedback` (JWT user id) and answers `{"ok": true}`.
- **Observability**: one `agent_turn` log line per turn (hashed user, tool steps with ms / rows / ok, model calls with prompt, cache-hit and completion tokens, total ms, `verified` = pass | regenerated | template, outcome). `X-Agent-Debug: 1` returns the same as `debug` in the response (used by the evals; no user data).
- **Database**: tables `agent_usage` (daily token budget, atomic `INSERT ... ON CONFLICT DO UPDATE`) and `agent_feedback` live in `migrations/0001_init.sql`; the tool queries need no functions or extensions. The queries port the original Postgres `agent_*` functions; their output documents are the contract.
- **Queries** (`queries.ts`, D1): one function per tool, always bound to the user id of the verified token (never to anything the model sends); every value is a bound parameter and the only SQL text built in code comes from fixed fragments picked by validated enums. Each returns the same document the Postgres `agent_*` functions did (money as rupee numbers from cents, `jsonb_strip_nulls` mirrored by leaving optional keys out), so `tools.ts` shaping, `template.ts`, `blocks.ts` and the evals did not change. The calls of a step run in parallel (`executeQueries`); a failing call reports its own error (`QueryUserError` text for mistakes the model can fix, a generic line otherwise) and never hides the others. Days (`daily_cashflow`, weekday / month buckets, `list_transactions` dates) are cut in TypeScript in the user's timezone (`core/timezone.ts`, `dayTotalsFromRows`): SQLite has no IANA zones. `resolve_entities` scores the user's most used 400 `(payee_key, name)` pairs and the visible categories with a TypeScript port of pg_trgm `similarity()` / `word_similarity()` (`trigram.ts`, threshold 0.4 like the Postgres function, so the pre-pass thresholds 0.5 / 0.95 / 0.15 are unchanged). `aggregate_transactions` replaced the `run_sql` fallback: SQLite has no row level security to make model-written SQL safe, so averages, weekday / month patterns, counts and distinct payees are a fixed, validated aggregate (metric sum | avg | count | count_distinct_payees, group_by none | weekday | month | category | payee, filters type, category, payee, min / max amount, dates).
- **Tests**: `test/agent-*.test.ts` (loop, DeepSeek client incl. streaming chunks, memory, pre-pass, verification and template, tools and blocks, the D1 queries on seeded data incl. user isolation and timezone edges, the pg_trgm port, the eval fixtures, routes incl. SSE framing, feedback, kill switch, budget).
- **Evals**: `evals/` (see `evals/README.md`): D1 fixture seed, 109 golden conversations, a runner with metrics and reports, `.github/workflows/agent-evals.yml` (weekly + manual).

## Email (R4)

`features/email/`: welcome, weekly/monthly digests, unsubscribe.

- **Claim / reclaim** (`sends-repository.ts`): insert `email_sends` `pending` with `claimed_at`; only a unique violation means "already claimed" (any other error propagates); then a conditional update reclaims a `pending` row older than 30 minutes. Send success -> `sent` (+ Brevo message id); failure -> the pending row is deleted.
- **Welcome**: `createEmailService(env, db).sendWelcomeIfNeeded` (called by `GET /me` through `waitUntil`) needs `BREVO_API_KEY` and `EMAIL_UNSUBSCRIBE_SECRET` (missing -> logged skip; S3: there is no fallback secret), claims `(welcome, once)`, sends, marks sent; a failed send releases the claim and is only logged.
- **Digest fan-out** (`digest.ts`): cron `30 2 * * *` (08:00 IST) -> `dueDigestKinds` (Monday -> weekly, 1st -> monthly, both when they coincide; IST calendar day) -> page `user_settings` where the flag is on (1000 per page, stable order) -> `EMAIL_QUEUE.sendBatch` of `{type: 'digest', user_id, kind, period_key}` in batches of at most 100. Period keys as in Python: `YYYY-Www` (previous Mon-Sun, ISO week) and `YYYY-MM` (previous month). `POST /api/v1/internal/email/run {kind}` (`X-Email-Cron-Secret`, constant-time compare, rejected when the secret is unset) enqueues the same messages and answers `{sent, queued}` (both are the number queued: delivery is asynchronous).
- **Consumer** (`consumer.ts`, queues `dime-email` / `dime-email-staging`, DLQ `dime-email-dlq*` handled by `handleEmailDlq`, which logs `email_digest_dead_lettered` and acks; every failed attempt already released its claim): per message `sendDigest` = look up the address, claim, build the payload from SQL aggregates (period summary incl. debit-by-category, payee totals, top 5 debits, budget; no per-row loops), render, Brevo, mark sent. A failure releases the claim; transient errors (Brevo 408/425/429/5xx, network, DB hiccup) `retry({delaySeconds: 30 * 2^(attempt-1), max 600})`, permanent ones (Brevo refusal) are logged and acked. One FavQs request per batch (2 s timeout, fallback pool).
- **Unsubscribe**: `GET /api/v1/email/unsubscribe?token=` (HTML page, or `400 {"detail": "Invalid unsubscribe link."}`; `422` for a token shorter than 8). Tokens are byte-compatible with Python (`user|kind|issued|hmac_sha256_hex`, 90 days); `test/email-core.test.ts` pins vectors generated by the Python implementation.
- **Static assets**: the five welcome postcards live in `public/email/` and are served at `/email/*` by Workers Static Assets (no Worker CPU). Emails use `EMAIL_ASSET_BASE_URL` when set, else `EMAIL_PUBLIC_BASE_URL/email`. Set `EMAIL_ASSET_BASE_URL` to host them elsewhere. `/static/email/*` (the old Python mount) 301-redirects to `/email/*`.

## Bundle

`wrangler deploy --dry-run --outdir dist` prints the upload size: about 693 KiB raw / 169 KiB gz after the move to D1 (the Supabase clients, postgres.js and the 1.1 MiB libpg-query WASM are gone). All `zod` imports are namespace imports (`import * as z`) so tree shaking works.

## Parity tooling

`scripts/parity/` (Node via `tsx`, all offline except `parity.ts`). The Python backend only runs against Supabase, so a live diff needs the same test data loaded into both backends:

| Command | What it does |
| --- | --- |
| `npm run parity:routes` | Scans `frontend/src` for every `dimeApi.<method>(path)` call and checks the Hono app serves it (35 calls, all covered). |
| `npm run parity:tokens` | Unsubscribe tokens, both directions against `backend/features/email/tokens.py`: byte-identical signing, cross verification, rejections (tamper, wrong secret, expired, future, bad kind) and edge cases. |
| `npm run parity` | Live diff of every read-only endpoint on both backends: `PY_BASE_URL=... TS_BASE_URL=... OLD_TOKEN=<Supabase JWT> NEW_TOKEN=<Worker access token> [TIMEZONE=Asia/Kolkata] npm run parity -- [--include-writes] [--include-agent] [--tokens] [--verbose] [--only text] [--month YYYY-MM] [--json out.json]`. Normalises money (`"5000.0"` vs `"5000.00"`), `+00:00` vs `Z`, microsecond vs millisecond timestamps, signed media URLs (Supabase Storage vs Worker `/media`: only the object key is compared) and request ids; ordering differences are warnings. `--include-writes` runs a create / update / delete scenario on a TEST account (categories, budgets, a manual transaction with an `Idempotency-Key` and a replay, push token) per backend and always cleans up. |

## Notes

- Error shape is FastAPI-compatible: `{"detail": "message"}`, or `{"detail": [{type, loc, msg}]}` for validation (422). The one exception is the agent chat outcome (C5, above).
- `queue()` / `scheduled()` in `src/index.ts`: ingest queue, DLQ, email queue, the `*/5` recovery sweep and the `30 2 * * *` digest fan-out are all live.
