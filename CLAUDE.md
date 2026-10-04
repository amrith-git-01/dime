# Dime: project context for Claude

Dime is a budgeting / expense-tracking app.

- `frontend/`: Expo SDK 54 / React Native 0.81 / React 19 / TanStack Query 5 / Zustand, with React Compiler on.
- `backend/`: the original Python 3.12 FastAPI API. It is being **replaced**, see below.
- `api/`: the **new backend**, TypeScript + Hono on **Cloudflare Workers (Workers Paid, $5/mo)**.
- `supabase/migrations/`: every database change, as timestamped SQL files. Supabase (Postgres, Auth, Storage, Realtime) **stays** as the database. Never connect to it from agent sessions; the user applies migrations.

Also follow `AGENTS.md` and the matching `.cursor/rules/*.mdc` files: frontend architecture, React Native and FastAPI rules. The Grok-only rule does not apply to Claude.

## Current direction (decided 2026-10-04)

1. **Audit and fix the whole app**: bugs, performance and good practices. Plan: `C:\Users\selva\.claude\plans\now-i-need-to-radiant-backus.md`, Phases 0–7.
2. **Rewrite the backend in TypeScript + Hono for Cloudflare Workers.**
   - This is **not a lift-and-shift**. Design it from scratch for Workers, using each framework's best practices:
     - Hono: route grouping, typed `Env` bindings, middleware, `HTTPException`, Zod validation
     - Workers: bindings, `ctx.waitUntil`, Queues, Cron Triggers, Hyperdrive, Static Assets, observability
     - supabase-js, Zod, strict TypeScript
   - Optimize for low CPU and memory and few subrequests. Use parallel I/O, SQL-side aggregation and no per-request heavy initialization.
   - **Don't break anything.** The HTTP API (paths, request and response shapes, status codes) must stay compatible with the current app. The Python backend and its tests are the behavioural spec. The "Shared API contracts" C1–C8 in the plan are authoritative.
   - Infra mapping:
     - In-memory job queues → Cloudflare Queues, with a DLQ and the `jobs` table.
     - In-process email ticker → Cron Trigger fan-out to a Queue.
     - asyncpg (agent SQL) → Hyperdrive + postgres.js, with the RLS role switch and read-only transaction kept.
     - LangGraph → a plain typed async loop over the same agent steps.
     - ffmpeg → removed; audio goes to Groq as recorded, and the iOS app records m4a.
     - Static email assets → Workers Static Assets.
   - The Heroku/Docker plan (Phase 3) is **dropped**. The fixed Python backend remains only as the spec and fallback until cutover.

## Status (2026-10-04)

**Code-complete and verified locally:**
- Audit phases 0–2 and 5–7.
- Rewrite R0–R5.
  - `api/` has 684 tests passing.
  - The frontend has 55 tests passing.
  - The Python backend has 303 tests passing.

**Not yet done:**
- Nothing has been deployed or committed.
- The 8 migrations in `supabase/migrations/` are unapplied.

**Next steps:** the user follows `docs/rewrite/GO-LIVE.md` and `api/DEPLOY.md`. Behavioural reference: `docs/rewrite/parity-spec.md`. Parity tools are in `api/scripts/parity/`.

**`EXPO_PUBLIC_API_BASE_URL` is origin-only.** Do not include `/api/v1`, because the app's paths already include it.

## Working rules (from the user)

- **Build each phase fully, then test.** Don't run tests after every small step. Run verification (typecheck, lint, tests, end to end where possible) once a big chunk or phase is complete.
- **One subagent per phase** (model: Sonnet). After each full phase, the main session reviews the diff before starting the next phase.
- **No git commits or pushes** unless the user asks. Preserve uncommitted work-in-progress.
- **Match surrounding code style.** Don't reformat unrelated code.
- Windows dev machine: the Bash tool is Git Bash. In `backend/`, use `uv run python -m pytest` and `uv run python -m ruff`.

## Verification commands

- **New API** (`api/`): `npm run typecheck`, `npm run lint`, `npm test` (Vitest with `@cloudflare/vitest-pool-workers`), `npx wrangler dev`.
- **Frontend** (`frontend/`): `npx tsc --noEmit`, `npm run lint`, `npm test`.
- **Python backend** (`backend/`): `uv run python -m ruff check .`, `uv run python -m pytest -q`.
