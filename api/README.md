# Dime API (`api/`)

TypeScript + [Hono](https://hono.dev) on Cloudflare Workers. Replaces the Python FastAPI backend in `../backend/` while keeping the HTTP API compatible with the mobile app (contracts C1-C8 in the rewrite plan). Supabase stays as the database.

## Local development

Requires Node 22+. Deploying: see [`DEPLOY.md`](DEPLOY.md); the ordered go-live list is `../docs/rewrite/GO-LIVE.md`.

```bash
cd api
npm install
cp .dev.vars.example .dev.vars   # fill in Supabase keys etc.
npm run dev                      # wrangler dev -> http://127.0.0.1:8787
```

- `SUPABASE_URL` and other non-secrets live in `wrangler.jsonc` `vars` (replace the `REPLACE-ME` placeholder); `.dev.vars` overrides them locally. Secrets are set with `wrangler secret put NAME`.
- **Hyperdrive (agent SQL, R4):** the `HYPERDRIVE` binding has a placeholder `id` and a `localConnectionString` for local Postgres. To point local dev at another database set
  `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://user:pass@host:5432/db`.
  For deploys create it once: `npx wrangler hyperdrive create dime-db --connection-string=...` and paste the id.
- Queues and rate-limit bindings run locally in Miniflare; the rate limiter is a no-op if the binding is missing.
- After editing `wrangler.jsonc` run `npm run cf-typegen` (regenerates `worker-configuration.d.ts`, which is committed).

| Script | Purpose |
| --- | --- |
| `npm run dev` | `wrangler dev` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (typescript-eslint, type-checked) |
| `npm test` | Vitest inside workerd via `@cloudflare/vitest-pool-workers` |
| `npm run cf-typegen` | `wrangler types --strict-vars=false` |
| `npm run deploy` | `wrangler deploy` (use `--env staging` for staging) |
| `npm run parity` / `parity:validator` / `parity:tokens` / `parity:routes` | Parity tooling against the Python backend (section "Parity tooling (R5)") |
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
    auth.ts         requireAuth (Supabase JWT via jose), currentUser(c)
    supabase.ts     getSupabase(c) service client, createServiceClient (PostgREST + Storage sub-clients; no supabase-js umbrella)
    http.ts         fetchJson / fetchWithRetry (timeout, bounded retries, UpstreamError)
    validation.ts   validate(target, schema): zod validator with FastAPI-style 422
    body-limit.ts   limitBody / limitUpload (413)
    cors.ts         CORS only when CORS_ORIGINS is non-empty
    rate-limit.ts   rateLimit('WRITE_LIMITER' | 'AI_LIMITER')
  features/<feature>/
    routes.ts       Hono router: parse/validate, call service, shape response
    schemas.ts      zod schemas (request + response) and inferred types
    service.ts      business logic (pure where possible)
    repository.ts   all Supabase/SQL access for the feature
test/               Vitest specs (run in workerd)
public/email/       static email images, served as /email/* by Workers Static Assets
```

## Adding a feature

1. Create `src/features/<name>/{routes,schemas,service,repository}.ts`.
2. In `routes.ts` export a `new Hono<AppBindings>()` router. Protect it with `router.use(requireAuth)`; add `rateLimit('WRITE_LIMITER')` on mutating routes and `rateLimit('AI_LIMITER')` on LLM routes (after `requireAuth`).
3. Validate input with `validate('json' | 'query' | 'param', schema)` and read it with `c.req.valid(...)`. Do not use `zValidator` directly (the wrapper produces the FastAPI-compatible 422).
4. Throw `AppError` subclasses (`NotFoundError`, `ConflictError`, `ValidationError`, ...) from services/repositories; never `try/catch` in routes just to map errors. Anything else becomes a 500 `{"detail":"Internal error","request_id"}` (C8).
5. Get the DB client with `getSupabase(c)` and pass it (and `user.id`) into services. Always filter by the JWT user id; the service role bypasses RLS.
6. Read config with `getConfig(c.env)`; add new env vars to the zod schema in `core/env.ts`, `wrangler.jsonc` `vars` (both top level and `env.staging`) and `.dev.vars.example`.
7. Mount the router in `src/app.ts` with `api.route('/<name>', router)`.
8. Outbound HTTP (Groq, DeepSeek, Brevo, FavQs, Expo) goes through `fetchJson`/`fetchWithRetry`. Do not retry non-idempotent calls unless the provider supports it.
9. Background work: `c.executionCtx.waitUntil(...)` for small fire-and-forget tasks, Queues for anything slow or retryable.
10. Add tests in `test/` (`app.request(path, init, env)` with `makeEnv()`/`signToken()` from `test/helpers.ts`).

## Testing against Supabase (stub)

`test/supabase-stub.ts` replaces `globalThis.fetch` so the REAL supabase-js query builder runs and tests assert on the PostgREST/Storage requests it produces (table, filter params, headers, JSON body) while scripting responses:

```ts
const stub = useSupabaseStub();                       // describe level: fresh stub per test
stub.on('GET', '/rest/v1/categories', () => rows([...]));            // route by method + path substring/regex
stub.on('POST', '/rest/v1/rpc/fn', () => pgError('P0002', 'x'), { once: true });
const res = await call('/api/v1/categories', { method: 'PATCH', json: {...} });   // test/helpers.ts: signs a JWT for USER_ID
expect(stub.last('PATCH', '/rest/v1/categories').params.get('user_id')).toBe(`eq.${USER_ID}`);
```

Helpers: `rows(data, total?)`, `json`, `pgError(code, msg, status)`, `makeCtx()` (collects `waitUntil` promises; pass to `call` as 3rd arg and `await flush()`). Matching is on path only (not host), unmatched requests return a 599 PostgREST-style error. `.single()` responses are unwrapped from arrays automatically. Outbound HTTP (Expo, avatar fetch) goes through the same stub.

Conventions added in R1: `DimeSupabaseClient` (since R5 a small `{from, rpc, storage}` composed of `@supabase/postgrest-js` and `@supabase/storage-js`) is untyped, so each repository declares its row interfaces and uses `.throwOnError().overrideTypes<Row, { merge: false }>()`; `core/db-errors.ts` classifies PostgREST errors; `core/decimal.ts` (`decimalInput`, `formatMoney`), `core/timestamps.ts` (`isoUtc`), `core/background.ts` (`defer`), `core/image-format.ts`, `validation.ts` `uuidString`/`unprocessable`. `requireAuth` is idempotent so routers sharing a prefix (`/me`, `/me/settings`, ...) verify the token once.

## Transactions (R2)

- `features/transactions`: list/detail/create/update/delete, home and month summary. `features/insights`: month insights. Shared pieces for R3: `transactions/service.ts` `createTransaction` (payment-hash dedupe + sparse merge, takes `detectedVia`/`receiptUrl`/`voiceUrl`), `features/media/*` (signing, upload, private path builder, magic-byte sniffing), `features/jobs/*` (jobs repository, `Idempotency-Key` parsing, `runIdempotent`), `features/notifications/{emitter,budget-evaluator,after-insert}.ts` (`notifyAfterInsert` is what the queue consumer calls after inserting a captured transaction).
- Aggregates use SQL functions from `supabase/migrations/20261004000600_transactions_aggregates.sql` (`transactions_daily_totals`, `transactions_payee_totals`) plus the existing `transactions_period_summary`. Each has a row-paging fallback in TS, so the Worker works before the migration is applied (it just transfers more rows).
- Timezone math is `core/timezone.ts` (Intl only). Ranges are always half-open `[from, to)` and sent to Postgres as UTC instants.
- Money in responses is a 2-decimal string ("480.00"); empty days in daily series are "0", as in Python.
- Post-create budget evaluation, notifications and push run in `waitUntil` (`defer`): the 201 body never depended on them.

## Ingest pipeline: receipt / voice / SMS (R3)

- **Endpoints** (`features/ingest/routes.ts`, mounted at `/transactions`): `POST /receipt` (10 MB), `POST /voice` (15 MB), `POST /sms` (50 messages). All answer 202. Receipt/voice: `limitUpload` (413), `Idempotency-Key` looked up BEFORE the body is read, magic-byte sniff (415; voice also refuses CAF: Groq cannot read it and there is no ffmpeg), raw file to the PRIVATE bucket, then ONE `jobs` row (`pending`, payload = object path only) and `INGEST_QUEUE.send({job_id, kind})`. SMS inserts the whole batch in one statement (all or nothing) with derived keys `"<key>:<index>"`; a replay rebuilds the per-message result from the existing rows. If the queue send fails after the insert the request still succeeds and the row stays `pending` for the sweep.
- **Consumer** (`features/ingest/consumer.ts`, `queue()` in `index.ts` routes by queue name): per message `claimJob` (conditional pending -> processing, attempts + 1, max 3), download media, AI pipeline, `createTransaction` (server-set `detected_via` scan/voice/sms and receipt/voice path), `notifyAfterInsert`, `markDone {transaction_id}`. Transient errors (AI/upstream 408/429/5xx, network, DB hiccup) on a non-final attempt release the job to `pending` and `message.retry({delaySeconds: 5 | 10 | 30})`; permanent errors or the 3rd attempt `markFailed` (<= 500 chars) + `capture_failed` notification (receipt `scan`, sms `sms`, none for voice) and ack. `dime-ingest-dlq` has its own consumer that fails the job only if still unfinished, notifies, and acks. **Receipt OCR (R5):** Groq vision is given a short-lived (5 min) signed https URL of the private object as `image_url`, so no image bytes pass through the Worker and Groq's 4 MB base64 limit no longer applies (a URL request may be 20 MB; uploads are capped at 10 MB). Only when signing fails (or the URL is not https, e.g. a local Supabase) does the pipeline download the object and send base64. Ingest `max_batch_size` is 5, processed 3 at a time.
- **Recovery sweep** (`features/ingest/sweep.ts`): cron `*/5 * * * *` calls `requeueStaleProcessing` + `listRecoverable` (updated_at older than 120 s, oldest first, 50 per kind) and re-sends the ids. `scheduled()` dispatches on `controller.cron`; `30 2 * * *` is the email-digest fan-out (R4, below).
- **AI** (`features/ai/`): `prompts.ts` (ported verbatim), `groq.ts` (vision OCR, Whisper primary then fallback; the recorded audio is sent as-is), `deepseek.ts` (JSON mode, `AI_PARSE_FALLBACK` model chain, `AI_TIMEOUT_SECONDS` split across candidates), `parse-output.ts` (normalization + zod validation, port of `_parse_and_validate`), `service.ts` (`parseReceipt` / `parseVoice` / `parseSms`). Errors are `TransientAiError` / `PermanentAiError` with generic messages; provider detail is only logged (S9). The agent (R4) reuses `ai/http.ts` (`aiPost`).
- **DB**: `supabase/migrations/20261004000700_transactions_payment_hash_unique.sql` adds the unique partial index on `transactions (user_id, payment_hash)` (active rows). `createTransaction` already resolves its 23505 to the winning row.
- **Tests**: `test/ingest-*.test.ts` and `test/ai.test.ts` use the Supabase stub plus `FakeQueue` / `FakeMessage` (`test/ingest-fixtures.ts`); consumer functions take plain message objects.

## AI agent (v2)

`features/agent/`, design and contract C9 in `../docs/rewrite/agent-v2.md`. The fixed classify -> generate SQL -> reflect -> respond pipeline is gone: the agent is a bounded tool-calling loop over Postgres functions.

```
POST /api/v1/agent/chat   requireAuth -> AI_LIMITER -> body limit (1 MiB) -> zod -> bad timezone 400
                          -> kill switch (AGENT_ENABLED) -> daily token budget -> turn
turn: pre-pass (no LLM) -> [ DeepSeek call -> tools ]* -> answer -> numeric verification -> blocks + memory
```

- **Pre-pass** (`prepass.ts`, `range.ts`, `tools.ts`): a time hint from the question ("June 2026", "last 7 days", "April to June"; none when a comparison, a day of month or two separate months make it ambiguous) or from the memory, and fuzzy entity resolution with `pg_trgm` over the user's payees and categories (`agent_resolve_entities`: `word_similarity` + `similarity`, GIN indexes). A name that matches two payees (or two categories) equally and exactly neither ends the turn with "Did you mean A or B?" and no model call. Matches go to the model as ids, so it can call data tools in its first step.
- **Loop** (`service.ts` `runAgentTurn`): the model (`AGENT_MODEL`, non-thinking, temperature 0, function calling) picks tools; the calls of one step run together (max 3, the rest get an error result) in ONE read-only Hyperdrive transaction (`sql-executor.ts` `executeToolCalls`: claims via `set_config`, `set local role authenticated`, `set local statement_timeout`, then the pipelined `select public.agent_*(...)` calls; the client has `max: 1`, so a request never holds more than one connection). `run_sql` (validator + LIMIT wrapper, result capped at 20 rows, `note` column dropped) runs in its own transaction. At most `AGENT_MAX_STEPS` (4) tool steps, then the model must answer (`tool_choice: none`, tool list unchanged, so the prefix cache holds). Turn deadline `AGENT_TURN_TIMEOUT_SECONDS` (25 s) and `AGENT_LLM_TIMEOUT_SECONDS` (12 s) per model call, enforced with `AbortSignal` through every fetch; `AGENT_MODEL_FALLBACK` is tried once, only while at least 4 s remain. With tool results in hand, a model failure or the deadline yields the template answer; without any, the C5 error.
- **Tools** (`tools.ts`): zod schemas are the single source of truth (`z.toJSONSchema` -> the `tools` sent to DeepSeek; the model's arguments are validated with the same schema and a failure goes back to the model as the tool result). `resolve_entities`, `spending_summary`, `category_breakdown`, `top_payees`, `daily_cashflow` (<= 40 days), `compare_periods`, `budget_status`, `list_transactions` (<= 20 rows; date, amount, type, payee, category only; never `note`), `run_sql`. Date arguments are INCLUSIVE local dates (`YYYY-MM-DD`); the database is called with half-open UTC instants `[from 00:00, to + 1 day 00:00)` in the user's timezone. All values are bound as text and cast in SQL, so the driver never infers types. Results are compact jsonb; money fields come back as a decimal string plus `<key>_display` with Indian grouping (`money.ts`).
- **Prompt** (`prompts.ts`): static system prompt, static tool list, then ONE user message with memory, earlier user questions (<= 3 turns, <= 1.5k chars; client assistant text is never used), the server-resolved block, the NOW block and the question. Tool results are `tool` messages wrapped in `<data tool="...">`.
- **Answer verification** (`verify.ts`): every amount (₹ / Rs / INR, lakh / crore / k), percentage and number >= 1000 in the answer must be one of the numbers in the tool results (commas of either grouping, whole-rupee rounding, shorthand rounded to its precision). On a mismatch the model regenerates ONCE (non-streamed, `tool_choice: none`, told which figures failed); still wrong gives the deterministic template (`template.ts`) built from the last useful tool result. `final.answer` is authoritative.
- **Charts and deep link** (`blocks.ts`): built from the tool results, never from model text: a donut for `category_breakdown` / `top_payees`, a zero-filled cashflow chart for `daily_cashflow`, a `compare_bar` for `compare_periods`; a TransactionsList payee / category / day link for the last call scoped to one payee, category or day (names the turn learned only). Both go through the contract's schema validation (`chart.ts`, `deep-link.ts`).
- **Memory** (`memory.ts`): `memory` = `base64url(payload).base64url(HMAC-SHA256)` signed with `AGENT_MEMORY_SECRET`; payload `{v, user_id, time_range, entities, last_tools, summary <= 300, exp}`, 24 h. Verified for signature, user and expiry; anything else is ignored (the turn runs without memory). Without the secret the feature is off (`memory: ""`).
- **Budget and kill switch** (`usage.ts`): `AGENT_ENABLED=false` answers `agent_disabled`; `agent_usage` (service role, one row per user and UTC day, `agent_usage_add` RPC) holds prompt + completion tokens, and a user at `AGENT_DAILY_TOKEN_BUDGET` (default 200 000) gets `daily_limit`. Recording happens after the response (`waitUntil`); a failed read fails open.
- **Responses** (C9). JSON (default): the C5 `ChatResponse` `{answer, blocks, deep_link}` plus `memory` and `turn_id`. SSE (`Accept: text/event-stream`, Hono `streamSSE`): `step {tool,label}` per tool call, `delta {text}` while the answer streams, then `final` (the JSON response, authoritative) or `error {code,message}`; events are written in order and a client disconnect aborts the turn. Failures are C5 bodies (HTTP 200 `{"error": {"code": "assistant_busy" | "assistant_error" | "agent_failed" | "agent_disabled" | "daily_limit", "message"}}`, or the `error` event); a bad timezone is 400, an unreachable database 503 + `Retry-After` in JSON mode (an `assistant_busy` error event in SSE).
- **Feedback**: `POST /api/v1/agent/feedback {turn_id, rating: "up" | "down", comment?}` upserts one row per (user, turn) into `agent_feedback` (service role, JWT user id) and answers `{"ok": true}`.
- **Observability**: one `agent_turn` log line per turn (hashed user, tool steps with ms / rows / ok, model calls with prompt, cache-hit and completion tokens, total ms, `verified` = pass | regenerated | template, outcome). `X-Agent-Debug: 1` returns the same as `debug` in the response (used by the evals; no user data).
- **Database** (`supabase/migrations/20261005000100_agent_v2.sql`): `pg_trgm` + trigram indexes, the `agent_*` functions (SECURITY INVOKER, STABLE, `auth.uid()`, half-open ranges, execute for `authenticated` only), `agent_usage` + `agent_usage_add`, `agent_feedback` (RLS: insert and select own). `run_sql` denies the `agent_*` names.
- **SQL validator** (`sql-validator.ts`, `pg-parser.ts`): the rules of audit item S2 are unchanged (real PostgreSQL parser `libpg-query` 17.x as WASM: one SELECT, allowlisted tables, denied functions, LIMIT wrapper); it now only guards the `run_sql` fallback. The parser is loaded lazily, on the first `run_sql`.
- **Executor and Hyperdrive** (`db.ts`): postgres.js over the `HYPERDRIVE` binding, one client per request, closed with `waitUntil`; everything the agent sets is transaction-local, so nothing leaks between users on the pooled connection (see "Hyperdrive and the pipelined agent transaction" below). Exercised under `wrangler dev` against a throwaway PostgreSQL 16 with a fake upstream model.
- **Tests**: `test/agent-*.test.ts` (loop, DeepSeek client incl. streaming chunks, memory, pre-pass, verification and template, tools and blocks, executor, validator, routes incl. SSE framing, feedback, kill switch, budget).
- **Evals**: `evals/` (see `evals/README.md`): fixture seed, 109 golden conversations, a runner with metrics and reports, `.github/workflows/agent-evals.yml` (weekly + manual).

## Email (R4)

`features/email/`: welcome, weekly/monthly digests, unsubscribe.

- **Claim / reclaim** (`sends-repository.ts`): insert `email_sends` `pending` with `claimed_at`; only a unique violation (23505 / PostgREST 409) means "already claimed" (any other error propagates); then a conditional update reclaims a `pending` row older than 30 minutes. Send success -> `sent` (+ Brevo message id); failure -> the pending row is deleted.
- **Welcome**: `createEmailService(env, db).sendWelcomeIfNeeded` (called by `GET /me` through `waitUntil`) needs `BREVO_API_KEY` and `EMAIL_UNSUBSCRIBE_SECRET` (missing -> logged skip; S3: there is no fallback secret), claims `(welcome, once)`, sends, marks sent; a failed send releases the claim and is only logged.
- **Digest fan-out** (`digest.ts`): cron `30 2 * * *` (08:00 IST) -> `dueDigestKinds` (Monday -> weekly, 1st -> monthly, both when they coincide; IST calendar day) -> page `user_settings` where the flag is on (1000 per page, stable order) -> `EMAIL_QUEUE.sendBatch` of `{type: 'digest', user_id, kind, period_key}` in batches of at most 100. Period keys as in Python: `YYYY-Www` (previous Mon-Sun, ISO week) and `YYYY-MM` (previous month). `POST /api/v1/internal/email/run {kind}` (`X-Email-Cron-Secret`, constant-time compare, rejected when the secret is unset) enqueues the same messages and answers `{sent, queued}` (both are the number queued: delivery is asynchronous).
- **Consumer** (`consumer.ts`, queues `dime-email` / `dime-email-staging`; since R5 with a DLQ `dime-email-dlq[-staging]` whose handler `handleEmailDlq` only logs `email_digest_dead_lettered` and acks: idempotent, no external calls, because every failed attempt already released its claim): per message `sendDigest` = look up the address, claim, build the payload from SQL aggregates (`transactions_period_summary` incl. debit-by-category, `transactions_payee_totals`, top 5 debits, budget; no per-row loops, so no new migration), render, Brevo, mark sent. A failure releases the claim; transient errors (Brevo 408/425/429/5xx, network, DB hiccup) `retry({delaySeconds: 30 * 2^(attempt-1), max 600})`, permanent ones (Brevo refusal) are logged and acked. One FavQs request per batch (2 s timeout, fallback pool).
- **Unsubscribe**: `GET /api/v1/email/unsubscribe?token=` (HTML page, or `400 {"detail": "Invalid unsubscribe link."}`; `422` for a token shorter than 8). Tokens are byte-compatible with Python (`user|kind|issued|hmac_sha256_hex`, 90 days); `test/email-core.test.ts` pins vectors generated by the Python implementation.
- **Static assets**: the five welcome postcards live in `public/email/` and are served at `/email/*` by Workers Static Assets (no Worker CPU). Emails use `EMAIL_ASSET_BASE_URL` when set, else `EMAIL_PUBLIC_BASE_URL/email`. Python defaulted to Supabase Storage (`.../storage/v1/object/public/<bucket>/email`, uploaded at startup); emails already sent keep working because those objects still exist. To keep Storage hosting set `EMAIL_ASSET_BASE_URL` to that folder URL (no upload script is needed unless the bucket is new: upload `public/email/slide-*.png` to `<bucket>/email/`). `/static/email/*` (the old Python mount) 301-redirects to `/email/*`.

## Deploy checklist for R4 (superseded by `DEPLOY.md`)

- `npx wrangler hyperdrive create dime-db --connection-string=<postgres url>`; paste the id in `wrangler.jsonc` (both envs); create it with `--caching-disabled`. The database user must be allowed `SET ROLE authenticated` (the `postgres` role is; otherwise `GRANT authenticated TO <user>`).
- Verify in the database that `authenticated` cannot EXECUTE a SECURITY DEFINER function that takes a user id (the validator blocks the known RPC names; the grants are the real boundary).
- `npx wrangler queues create dime-email` and `dime-email-dlq` (and the `-staging` ones).
- Secrets: `DEEPSEEK_API_KEY`, `BREVO_API_KEY`, `EMAIL_UNSUBSCRIBE_SECRET`, `EMAIL_CRON_SECRET`, optionally `FAVQS_API_KEY`. Vars: `EMAIL_FROM`, `EMAIL_PUBLIC_BASE_URL` (the Worker's public URL: it is baked into unsubscribe links and image URLs), `EMAIL_APP_LINK`.

## Hyperdrive and the pipelined agent transaction (R5 review)

Checked against the Hyperdrive docs (pooling, query caching, Postgres.js): the executor's single `begin read only` block with pipelined `set_config(..., true)` / `set local role` / `set local statement_timeout` / query is compatible. Hyperdrive pools in transaction mode, pins the connection for the transaction and resets it afterwards; everything the agent sets is transaction-local, so nothing leaks between users, and pipelining is just back-to-back protocol messages on that one connection. `prepare: true` keeps Hyperdrive's prepared-statement support for the driver's own statements (the agent's SQL runs through `unsafe()`, which is unprepared, costing at most an extra round trip). Cache: queries inside a transaction are never cached; the config should still be created with `--caching-disabled` because the same SQL text is run for different users under RLS. Origin: Supabase direct (or session pooler), never the 6543 transaction pooler. No code change was needed; the reasoning is in the `db.ts` comment and `DEPLOY.md`.

## Bundle (R5)

`wrangler deploy --dry-run --outdir dist --metafile` writes `dist/bundle-meta.json`. At the end of R4 the upload was 3228 KiB raw / 643 KiB gz, of which: zod 762 KiB (the `import { z } from 'zod'` form defeats tree shaking and pulls every locale; `import * as z` shakes down to 213 KiB), the `@supabase/supabase-js` umbrella ~620 KiB (auth-js 321, realtime-js + phoenix 138, functions 12, iceberg 16: never used), the libpg-query WASM 1.1 MiB raw (221 KiB gz, the largest single piece and needed by the agent), own code ~300 KiB, postgres.js 87, hono 66. Changes: all `zod` imports are namespace imports, and `core/supabase.ts` composes `@supabase/postgrest-js` + `@supabase/storage-js` directly (same headers and URLs as supabase-js; also drops the per-request Auth session lookup). Result: 2163 KiB raw / 463 KiB gz, `index.js` 2.1 MiB -> 1.0 MiB. What remains: WASM 1.1 MiB (loaded lazily, only on the first agent request), zod 213, own code 295, postgrest 110, storage 109, libpg-query glue 97, postgres.js 87. There is one copy of zod.

## Parity tooling (R5)

`scripts/parity/` (Node via `tsx`, all offline except `parity.ts`; nothing connects to Supabase unless you point it at a reachable project):

| Command | What it does |
| --- | --- |
| `npm run parity:routes` | Scans `frontend/src` for every `dimeApi.<method>(path)` call and checks the Hono app serves it (35 calls, all covered). |
| `npm run parity:validator` | Runs `validator-corpus.json` (315 SQL strings: Python and TS validator tests plus tricky extras) through the TS validator (the real source, bundled with esbuild, WASM read from disk) and the Python reference, diffs accept / reject. Python side by hand: `cd backend && uv run python ../api/scripts/parity/validator_py.py ../api/scripts/parity/validator-corpus.json ../api/scripts/parity/.build/validator-py.json`, then `npx tsx scripts/parity/validator-corpus.ts --py scripts/parity/.build/validator-py.json`. Known intentional deviations are listed (and explained) in `validator-corpus.ts`; exit 1 on anything undocumented or on a TS-more-permissive case. |
| `npm run parity:tokens` | Unsubscribe tokens, both directions against `backend/features/email/tokens.py`: byte-identical signing, cross verification, rejections (tamper, wrong secret, expired, future, bad kind) and edge cases. |
| `npm run parity` | Live diff of every read-only endpoint on both backends: `PY_BASE_URL=... TS_BASE_URL=... ACCESS_TOKEN=<user JWT> [TIMEZONE=Asia/Kolkata] npm run parity -- [--include-writes] [--include-agent] [--tokens] [--verbose] [--only text] [--month YYYY-MM] [--json out.json]`. Normalises money (`"5000.0"` vs `"5000.00"`), `+00:00` vs `Z`, signed-URL query strings and request ids; ordering differences are warnings. `--include-writes` runs a create / update / delete scenario on a TEST account (categories, budgets, a manual transaction with an `Idempotency-Key` and a replay, push token) per backend and always cleans up. |

## Notes

- Error shape is FastAPI-compatible: `{"detail": "message"}`, or `{"detail": [{type, loc, msg}]}` for validation (422). The one exception is the agent chat outcome (C5, above).
- `queue()` / `scheduled()` in `src/index.ts`: ingest queue, DLQ, email queue, the `*/5` recovery sweep and the `30 2 * * *` digest fan-out are all live.
