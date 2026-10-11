# Agent evals

Measures the agent (`src/features/agent`, design: `docs/rewrite/agent-v2.md`) on a fixed fixture: does it write SQL that finds the right numbers, does it stay away from the database when it should, does it ask when a name is ambiguous, and what does a turn cost.

| File | What it is |
| --- | --- |
| `seed.sql` | One fixture user (`d1e0eeee-0000-4000-8000-000000000001`) with 384 transactions from 2026-04-01 to 2026-10-03 (Asia/Kolkata), ten categories (four own, six of the system categories, so the fixture never needs a custom name that clashes with a system one), a monthly and a daily budget and five category budgets. Near-duplicate payees on purpose (Swiggy / Swiggy Instamart, Zomato / Zomato Gold, Cafe Coffee Day / Coffee Day Express, Amazon / Amazon Prime, "SWIGGY" spellings), a transaction on local midnight (`2026-07-01 00:00:00+05:30`) and one a second before it. Written for D1: one statement per line, money in cents, ISO-8601 UTC timestamps, `payee_key` precomputed. Re-runnable (it deletes the fixture user first). |
| `golden.jsonl` | 109 conversations (117 turns). Each turn has expected numeric facts computed from the seed, a reference `sql`, or `expect_clarification` (+ the names it must offer). Multi-turn lines exercise the memory token ("and July?"). |
| `run.ts` | The runner (`npm run evals`). |
| `../test/agent-evals.test.ts` | Proves the seed, the SQL guard and the golden facts agree on a local D1 (`npm run evals:validate`, also part of `npm test`). No LLM. |
| `generate.ts` | Produces `seed.sql` and `golden.jsonl` from one deterministic ledger (`npm run evals:generate`). Every fact is computed there with integer-cent arithmetic, independently of the agent's queries. |
| `fixture.ts` | The fixture user id. |

## Golden line format

```jsonc
{ "id": "g012", "turns": [ {
  "question": "How much did I spend on groceries in July 2026?",
  "facts": [{ "v": 9874.5, "k": "money" }], // money | percent | count; magnitudes (an answer says "17.8% less")
  "sql": [ "SELECT ROUND(SUM(amount), 2) AS spent ... FROM transactions WHERE local_date BETWEEN ..." ]   // reference queries over the exposed views, used by test/agent-evals.test.ts only
} ] }
```

Other keys: `expect_clarification` (+ `clarify_options`), `expect_no_sql` (out of scope / prompt injection / small talk: the agent must not query), `relative` (depends on today's date: no facts are scored, only that the turn does not fail), `note`.

Scoring: **numeric accuracy** (every fact found among the numbers of the answer, up to the rounding its formatting allows: paisa when written with decimals, a rupee otherwise, the shown precision for lakh/crore shorthand), **clarification accuracy** (a question that names every option and ran no SQL), **no-query accuracy** (`expect_no_sql` turns that ran no `run_sql`). The report also shows SQL queries and failed queries per turn, fallback answers and regenerations.

## Running against a real model

You need a Worker with the D1 migrations applied, `seed.sql` loaded and real `DEEPSEEK_API_KEY` and `AGENT_MEMORY_SECRET`: a local `wrangler dev` (see `../README.md`). Don't load the fixture into the production database. Load the seed into the local D1 once (it is re-runnable):

```bash
cd api
npx wrangler d1 execute DB --local --file evals/seed.sql
```

Then run the evals with a token for the fixture user:

```bash
# mint it from the Worker's AUTH_JWT_SECRET (HS256, iss dime-api, aud authenticated) ...
npm run evals -- --url http://127.0.0.1:8787 --jwt-secret "$AUTH_JWT_SECRET"
# ... or pass a token you made yourself
npm run evals -- --url http://127.0.0.1:8787 --token "$FIXTURE_USER_ACCESS_TOKEN"
```

Useful options: `--filter swigy`, `--limit 10`, `--mode json` (no time-to-first-token), `--rate 8` (requests per minute; the AI limiter allows 10 per user per minute and the runner also waits out a 429), `--min-no-sql 0.9 --min-numeric 0.9` (exit 1 below that). Pricing for the cost estimate: `EVAL_PRICE_INPUT_HIT`, `EVAL_PRICE_INPUT_MISS`, `EVAL_PRICE_OUTPUT` (USD per million tokens, defaults are DeepSeek's published rates when this was written: check them). A full run is ~118 requests, about 15 minutes at the default rate.

The runner sends `X-Agent-Debug: 1`: the response then carries a `debug` object (tool calls with timings, the SQL length and SQLite error of each `run_sql` but never the query or its rows, model calls with `prompt_cache_hit_tokens`, verification result, outcome). It holds no user data and is only produced on request.

Output: a table on stdout, `reports/<timestamp>.json` (every turn: answer, tools, tokens, latency, failures) and `reports/<timestamp>.md` (summary and the failing turns). `reports/` is git-ignored.

## Validating the fixtures (no LLM, no network)

After changing the ledger or the question list, regenerate and check that every fact is reachable through the real SQL guard:

```bash
npm run evals:generate
npm run evals:validate     # vitest run test/agent-evals.test.ts
```

`test/agent-evals.test.ts` applies the migrations to the local D1 of the Workers test pool, loads `seed.sql`, runs each reference `sql` through the production SQL guard (user-scoped views, local dates, rupee amounts), checks every fact against the numbers of the results (money and counts to the paisa, percentages to one decimal), and runs the pre-pass on the clarification questions to confirm they are ambiguous in the data. Every fact with a reference query and all clarification cases pass.

## CI

`.github/workflows/agent-evals.yml` runs only on demand (`workflow_dispatch`); never on pushes, pull requests or a schedule (it spends DeepSeek credit). It needs the repository secrets `EVAL_BASE_URL` and either `EVAL_JWT_SECRET` (that Worker's `AUTH_JWT_SECRET`; the runner mints the token) or `EVAL_ACCESS_TOKEN`, pointing at a reachable Worker whose D1 database has the migrations and `seed.sql` (not production: there is no separate eval environment, so this is for a temporary Worker you deploy yourself). The report is attached as an artifact and written to the job summary.

## Unit tests

The deterministic tests (mocked model, canned or real D1 queries) live in `../test/agent-*.test.ts`: the SQL guard (`agent-sql-guard.test.ts`, two users, every injection trick), the tools, loop control, memory, verification, SSE framing, routes. They run in `npm test`.
