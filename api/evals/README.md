# Agent evals

Measures the agent (`src/features/agent`, design: `docs/rewrite/agent-v2.md`) on a fixed fixture: does it pick the right tools, are its numbers right, does it ask when a name is ambiguous, and what does a turn cost.

| File | What it is |
| --- | --- |
| `seed.sql` | One fixture user (`d1e0eeee-0000-4000-8000-000000000001`) with 384 transactions from 2026-04-01 to 2026-10-03 (Asia/Kolkata), ten categories, a monthly and a daily budget and five category budgets. Near-duplicate payees on purpose (Swiggy / Swiggy Instamart, Zomato / Zomato Gold, Cafe Coffee Day / Coffee Day Express, Amazon / Amazon Prime, "SWIGGY" spellings), a transaction on local midnight (`2026-07-01 00:00:00+05:30`) and one a second before it. Re-runnable. |
| `golden.jsonl` | 109 conversations (117 turns). Each turn has the expected tools, expected numeric facts computed from the seed, or `expect_clarification` (+ the names it must offer). Multi-turn lines exercise the memory token ("and July?"). |
| `run.ts` | The runner (`npm run evals`). |
| `validate.ts` | Proves the seed, the SQL tools and the golden facts agree (`npm run evals:validate`). No LLM. |
| `generate.ts` | Produces `seed.sql` and `golden.jsonl` from one deterministic ledger (`npm run evals:generate`). Every fact is computed there with integer-cent arithmetic, independently of the agent's SQL. |
| `fixture.ts` | The fixture user id. |

## Golden line format

```jsonc
{ "id": "g012", "turns": [ {
  "question": "How much did I spend on groceries in July 2026?",
  "tools": ["spending_summary"],            // all of these must be called ...
  "alt_tools": [["category_breakdown"]],    // ... or all of any one of these sets
  "facts": [{ "v": 9874.5, "k": "money" }], // money | percent | count; magnitudes (an answer says "17.8% less")
  "plan": [ { "tool": "spending_summary", "args": { ... } } ]   // a reference plan, used by validate.ts only
} ] }
```

Other keys: `expect_clarification` (+ `clarify_options`), `expect_no_tools` (out of scope / prompt injection / small talk), `relative` (depends on today's date: only the tools are scored), `note`.

Scoring: **tool accuracy** (turns with expected tools or `expect_no_tools`), **numeric accuracy** (every fact found among the numbers of the answer, up to the rounding its formatting allows: paisa when written with decimals, a rupee otherwise, the shown precision for lakh/crore shorthand), **clarification accuracy** (a question that names every option and called no tool).

## Running against a real model

You need a Worker with the agent migration applied, `seed.sql` loaded, and real `DEEPSEEK_API_KEY` and `AGENT_MEMORY_SECRET`: a local `wrangler dev` (see `../README.md`, Hyperdrive local connection string pointing at a local or staging database) or the staging Worker. Then:

```bash
cd api
# mint the fixture user's token from the project's legacy JWT secret ...
npm run evals -- --url http://127.0.0.1:8787 --jwt-secret "$SUPABASE_JWT_SECRET" --supabase-url "$SUPABASE_URL"
# ... or pass a token you made yourself
npm run evals -- --url https://dime-api-staging.<subdomain>.workers.dev --token "$FIXTURE_USER_ACCESS_TOKEN"
```

Useful options: `--filter swigy`, `--limit 10`, `--mode json` (no time-to-first-token), `--rate 8` (requests per minute; the AI limiter allows 10 per user per minute and the runner also waits out a 429), `--min-tool 0.85 --min-numeric 0.9` (exit 1 below that). Pricing for the cost estimate: `EVAL_PRICE_INPUT_HIT`, `EVAL_PRICE_INPUT_MISS`, `EVAL_PRICE_OUTPUT` (USD per million tokens, defaults are DeepSeek's published rates when this was written: check them). A full run is ~118 requests, about 15 minutes at the default rate.

The runner sends `X-Agent-Debug: 1`: the response then carries a `debug` object (tool calls with timings, model calls with `prompt_cache_hit_tokens`, verification result, outcome). It holds no user data and is only produced on request.

Output: a table on stdout, `reports/<timestamp>.json` (every turn: answer, tools, tokens, latency, failures) and `reports/<timestamp>.md` (summary and the failing turns). `reports/` is git-ignored.

## Validating the fixtures (no LLM, no network)

After changing the ledger or the question list, regenerate and check that every fact is reachable through the real tools:

```bash
npm run evals:generate
# a throwaway database: Supabase-like roles (anon, authenticated, service_role), auth.uid(), the app tables with RLS,
# all migrations, then the seed
DATABASE_URL=postgres://postgres:pg@127.0.0.1:54399/postgres npm run evals:validate
```

`validate.ts` runs each reference `plan` through the production path (argument validation, `agent_*` function in a read-only transaction as role `authenticated` with the fixture user's claims, shaping), checks every fact against the results, and runs the pre-pass on the clarification questions to confirm they are ambiguous in the database. Exit code 1 on any mismatch. Last validated: 130 facts and all clarification cases pass on PostgreSQL 16.

## CI

`.github/workflows/agent-evals.yml` runs weekly (Monday 03:00 UTC) and on demand (`workflow_dispatch`); never on pushes or pull requests. It needs the repository secrets `EVAL_BASE_URL` and either `EVAL_JWT_SECRET` + `EVAL_SUPABASE_URL` (the runner mints the token) or `EVAL_ACCESS_TOKEN`, pointing at a staging Worker whose database has the migration and `seed.sql`. The report is attached as an artifact and written to the job summary.

## Unit tests

The deterministic tests (mocked model, fake executor) live in `../test/agent-*.test.ts`: loop control, guards, memory, verification, SSE framing, routes. They run in `npm test`.
