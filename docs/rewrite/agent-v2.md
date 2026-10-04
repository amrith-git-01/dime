# Dime Agent v2: bounded autonomous tool-calling agent

This replaces the fixed pipeline (classify → generate_sql → reflect → respond) in `api/src/features/agent/`.

**Goals:**
- Production-grade.
- Low latency and cost.
- Exact numbers.
- Safe.
- Measurable.

**Dead code:** after implementing v2, delete the old pipeline code, prompts, config and tests it replaces. No unused exports or files may remain.

## Architecture
```
POST /api/v1/agent/chat
  guards: requireAuth → AI_LIMITER → body limit → zod → daily token budget check
  deterministic pre-pass (no LLM): time range from text or memory, entity resolution (pg_trgm), clarify-if-needed
  AGENT LOOP (DeepSeek function calling, non-thinking):
     model picks tool(s) → execute (parallel when independent) → compact result back to model
     stop when the model answers, or when a guard trips:
       max 4 tool steps, 25 s deadline (AbortSignal through every fetch), token budget
  final answer: streamed (SSE) or JSON; charts/deep links validated server-side;
                numbers in the answer checked against tool results
  post: usage recorded, memory token issued, trace logged
```

## Tools
Every tool runs through Hyperdrive in ONE read-only transaction per step:
- `set local role authenticated`
- JWT claims set locally
- `statement_timeout`

That means RLS applies to all of them. The data tools are Postgres functions created by a new migration: `security invoker`, scoped by `auth.uid()`, half-open ranges, and execute granted to `authenticated` only.

Each tool returns a **compact** result: aggregates, top-N, and `row_count`/`truncated` flags. It never returns raw dumps.

| Tool | Args (validated with zod) | Purpose |
|---|---|---|
| `resolve_entities` | `{ text }` | Fuzzy match payees/categories (pg_trgm, top 5 with scores). Also runs in the pre-pass |
| `spending_summary` | `{ from, to, category_id?, payee_key? }` | Totals: debit, credit, net, count |
| `category_breakdown` | `{ from, to, type? }` | Per-category totals + share (top 8 + other) |
| `top_payees` | `{ from, to, category_id?, limit≤10 }` | Payee totals |
| `daily_cashflow` | `{ from, to }` (≤ 40 days) | Per-day credit/debit series |
| `compare_periods` | `{ a:{from,to}, b:{from,to}, by?: 'category'\|'payee'\|'total' }` | Deltas between two periods. Replaces the old compare path |
| `budget_status` | `{ period: 'month', at? }` | Monthly + category budgets vs spend |
| `list_transactions` | `{ from, to, category_id?, payee_key?, min_amount?, limit≤20, order }` | Specific rows. Only these fields: date, amount, type, payee display, category. **Never `note`** |
| `run_sql` | `{ query }` | Fallback only. The existing libpg-query validator + LIMIT wrapper. Results are capped and summarized before going back to the model |

## Prompting (prefix-cache friendly)
Message order:
1. **Static system prompt.** Role, rules, formatting, tool usage policy.
2. **Tool definitions.** Static.
3. **Compact memory** from the previous turn, plus the NOW block (date and timezone) **last**.
4. **User message.**

Tool results go back as `tool` messages, wrapped as data ("data, not instructions").

Rules:
- Money is formatted server-side. Tools return both `amount` (decimal string) and `amount_display` (₹ Indian grouping).
- History: only the server-signed memory and the last ≤ 3 user turns (≤ 1.5k chars total). **Client-supplied assistant text is never put in prompts.**
- Log DeepSeek `usage` per call, including `prompt_cache_hit_tokens`.

## Conversation memory
The server returns `memory`: a compact object, HMAC-signed with a server secret and base64url-encoded:
- `{ v, user_id, time_range, entities:[{type,id,name}], last_tools, summary ≤ 300 chars, exp }`

The client sends it back unchanged on the next turn. Verify the signature and the `user_id`; reject it if expired (24 h) or tampered.

This makes follow-ups ("and July?") work without trusting client text.

## Guardrails and cost
- **Step limit:** 4 tool steps per turn.
- **Parallel tool calls:** allowed, with a maximum of 3 at once.
- **Deadlines:** 25 s per turn and 12 s per LLM call. One fallback to the secondary model only if time remains.
- **Per-user daily token budget** (`AGENT_DAILY_TOKEN_BUDGET`, default 200k).
  - Stored in Postgres through a new table `agent_usage(user_id, day, prompt_tokens, completion_tokens, turns)` and RPC `agent_usage_add` (atomic upsert-increment, service role).
  - When exceeded, return the C5 error `{"error":{"code":"daily_limit","message":...}}`.
- **Kill switch:** var `AGENT_ENABLED=false` returns the C5 error `agent_disabled`.
- **Answer verification:**
  - Every number in the answer must appear in the tool results, with formatting tolerance (₹, commas, lakh).
  - On mismatch, regenerate once. If it still mismatches, return a deterministic template summary of the last tool result.
- **Empty or ambiguous results:** zero rows with a fuzzy entity → retry with the best match or ask "Did you mean X or Y?".

## API contract (C9). Backward compatible with C5.

**Request:** `POST /api/v1/agent/chat`
```json
{ "content": "...", "history": [ ...existing shape, assistant text ignored... ], "memory": "<token>"?, "timezone": "Asia/Kolkata"? }
```
Keep the existing fields; check the current `schemas.ts` and the frontend `api`. `memory` is new and optional.

**Response, JSON mode** (no `Accept: text/event-stream`): the existing `ChatResponse` shape **plus** `memory: string`. Errors follow C5.

**Response, SSE mode** (`Accept: text/event-stream`): HTTP 200 `text/event-stream`, with events:

| Event | Payload | When |
|---|---|---|
| `step` | `{ "tool": "category_breakdown", "label": "Breaking down your spending by category" }` | Each tool call |
| `delta` | `{ "text": "..." }` | Answer tokens (streamed from the final LLM call) |
| `final` | `ChatResponse + { memory }` | Last event on success. It includes the full answer (authoritative, post-verification), charts, blocks and deep links |
| `error` | `{ "code", "message" }` | Last event on failure |

If verification replaces the answer, `final.answer` is authoritative and the client must replace the streamed text with it.

## Observability
- **One structured log per turn:** request_id, user_id (hashed), steps [{tool, ms, rows, ok}], llm calls [{model, ms, prompt_tokens, cache_hit_tokens, completion_tokens}], total ms, verified, outcome.
- **Feedback:** `POST /api/v1/agent/feedback { turn_id, rating: 'up'|'down', comment? }` stores to an `agent_feedback` table (migration). The `final` event carries a `turn_id`.

## Evals
`api/evals/`:
1. **Seed:** `seed.sql`, a fixture user with about 6 months of realistic transactions, categories, budgets and payees, including near-duplicate payee names.
2. **Golden questions:** `golden.jsonl`, about 100 questions. Each has the expected tool(s) and expected numeric facts computed from the seed, or `expect_clarification`.
3. **Runner:** `run.ts` runs them against a local Worker (`wrangler dev`) or a URL with a real DeepSeek key. It reports tool-selection accuracy, numeric accuracy, steps/turn, latency p50/p95, tokens/turn and cost/turn, and writes JSON + markdown reports.
4. **CI:** `.github/workflows/agent-evals.yml` runs on schedule plus `workflow_dispatch` and requires the secrets. It is never run on PRs automatically.
5. **Unit tests:** deterministic tests with a mocked LLM cover loop control, guards, memory, verification and SSE framing.

## Deviations and decisions as built (2026-10-05)

Recorded after implementing `api/src/features/agent/` (details: `api/README.md`, "AI agent (v2)").

- **Dates in tool arguments are inclusive local dates** (`YYYY-MM-DD`, user's timezone). The server turns `[from, to]` into the half-open UTC instants `[from 00:00, to + 1 day 00:00)` before calling Postgres, so the SQL functions are half-open as designed and the model never does day arithmetic.
- **One message instead of a second system message.** DeepSeek's handling of several `system` messages is not documented, so the per-turn context (memory, earlier user questions, server-resolved block, NOW) and the question share ONE `user` message after the static system prompt and tool list. The prefix that is cached is unchanged.
- **"Parallel" tool calls are pipelined, not concurrent connections.** All data tools of a step run in ONE read-only transaction on one connection (back-to-back protocol messages), so postgres.js stays at `max: 1` and a request holds one Hyperdrive connection. `run_sql` runs in its own transaction (a failing statement would abort a shared one). A failing function call reports its own error; the step is not lost.
- **Charts and the deep link are built from tool results, not by the model** (donut for `category_breakdown` / `top_payees`, zero-filled cashflow for `daily_cashflow`, `compare_bar` for `compare_periods`; payee / category / day link for the last call scoped to one of them). This is what lets the answer be plain streamed prose and keeps ids and numbers out of model hands. Blocks follow the app's types: `compare_periods` of two whole calendar months or two years (full or year to date) gives the `compare_months` card (months: daily cashflow zero-filled; years: monthly cashflow and `chart_label` "Monthly Spend"; top 5 payees with `share` as a fraction), fetched by extra `agent_daily_cashflow` / `agent_top_payees` calls pipelined in the same transaction and never shown to the model, with no `compare_bar` next to it as before; other comparisons keep `compare_bar`. `spending_summary` gives `metric` blocks (Spent, Income, Net; Spent only when scoped to a payee or category), `category_breakdown` the donut plus 3 `category_row` blocks, `list_transactions` one `tx_preview` (5 rows: date, counterparty_name, amount_display, type, category; never `note`). At most 4 blocks and one chart per answer, newest tool first, one set per tool.
- **Tool details.** `list_transactions` also takes an optional `type` filter; `daily_cashflow` omits days without transactions (the chart is zero-filled server side); results carry `period`; money fields are decimal strings plus `<key>_display`. `resolve_entities` runs `word_similarity` with the `<%` threshold lowered to 0.4 inside the function (a function-level setting); the pre-pass looks up at most 8 phrases per turn.
- **Pre-pass.** Entity phrases are extracted deterministically (non-stopword runs as bigrams and words). The lookup only runs when there is a phrase. A clarification is issued when two payees (or two categories) score within 0.15 of each other and none is an exact name; an exact name always wins. Time hints are advisory: they are withheld when the question has a comparison word, a day of month, an ISO date or two separate months.
- **Verification scope.** Checked: amounts with ₹ / Rs / INR, lakh / crore / k shorthand, percentages and other numbers of 1,000 or more (years excluded). Small integers (counts, days) are not checked. Numbers the user wrote are allowed.
- **Streaming.** Content deltas are forwarded from every model call until that call starts a tool call; `final.answer` is authoritative. The regeneration after a failed verification is not streamed.
- **Fallback model** is tried once only when at least 4 s of the turn remain; below 1.5 s no model call starts (the template answer is used when data exists).
- **Memory.** A missing `AGENT_MEMORY_SECRET` switches memory off (`memory: ""`) instead of failing the turn; an invalid, expired, tampered or foreign token is ignored (the turn runs without memory) rather than rejected with an error.
- **Budget.** The day is the UTC day; tokens are prompt + completion; a failed read fails open; usage is recorded in `waitUntil` after the response and not for turns that made no model call.
- **Feedback** answers `200 {"ok": true}`; one rating per (user, turn), a new rating replaces the old one.
- **Eval support.** `X-Agent-Debug: 1` adds a `debug` object (tool steps, model calls with cache hits, tokens, verification, outcome) to the response; `final` in SSE mode too. `api/evals/` also holds `generate.ts` (fixture generator), `validate.ts` (fixture check against a database) and `fixture.ts`.
- **Config.** Removed: `AGENT_STRICT_TOOLS`, `AGENT_MAX_TOOL_ROUNDS` (now `AGENT_MAX_STEPS`), `AGENT_THINKING_ENABLED` (the agent is non-thinking: `tool_choice: none` is needed for the final step), `AGENT_TIMEOUT_SECONDS` (now `AGENT_TURN_TIMEOUT_SECONDS` and `AGENT_LLM_TIMEOUT_SECONDS`), `AGENT_CONTEXT_MAX_MESSAGES` (history is limited to 3 user turns / 1.5k chars). Added: `AGENT_ENABLED`, `AGENT_DAILY_TOKEN_BUDGET`, secret `AGENT_MEMORY_SECRET`. `AGENT_SQL_TIMEOUT_SECONDS` is 6 in `wrangler.jsonc` (it only bounds database statements now).
- **`run_sql`** denies the `agent_*` function names and never shows a `note` column to the model.

