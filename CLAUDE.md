# Dime: project context for Claude

Dime is a budgeting / expense-tracking app.

- `frontend/`: Expo SDK 54 / React Native 0.81 / React 19 / TanStack Query 5 / Zustand, with React Compiler on.
- `api/`: the backend, TypeScript + Hono on **Cloudflare Workers (Workers Paid, $5/mo, hard budget)**. One Worker with:
  - **D1** (`DB`, migrations in `api/migrations/`), **R2** (`MEDIA`, `/media/*`), **Workers AI** (`AI`, voice and receipt OCR, with a daily neuron cap), a **Durable Object** `UserHub` (live updates over WebSocket at `/api/v1/realtime`), **Queues**, **Cron**, **Static Assets**, rate limits.
  - Its own **Google sign-in** (`/api/v1/auth/google`, `/refresh`, `/sign-out`) with HS256 sessions.
  - **DeepSeek** for parsing and the agent, **Brevo** for email.
- There is no Supabase any more (the `supabase/` folder is gone). The old Supabase project holds test data only and is to be paused, then deleted, after the new build is live (`docs/rewrite/GO-LIVE.md`).

Also follow `AGENTS.md` and the matching `.cursor/rules/*.mdc` files: frontend architecture, React Native and FastAPI rules. The Grok-only rule does not apply to Claude.

## Current direction

1. **Audit and fix the whole app** (done): plan `C:\Users\selva\.claude\plans\now-i-need-to-radiant-backus.md`.
2. **Backend in TypeScript + Hono on Workers** (done), designed for Workers rather than ported: typed `Env` bindings, route grouping, Zod validation, `ctx.waitUntil`, Queues with a DLQ and the `jobs` table, a Cron fan-out for email, SQL-side aggregation, few subrequests. The HTTP API (paths, request and response shapes, status codes) stays compatible with the app; contracts C1–C8 are authoritative and `docs/rewrite/parity-spec.md` is the behavioural reference.
3. **Move off Supabase onto Cloudflare** (done in code, 2026-10-10): plan `C:\Users\selva\.claude\plans\the-agent-s-run-sql-tool-crispy-snail.md`, phases 1–7.
   - D1 replaces Postgres (money as integer cents, `payee_key` computed on write); the agent is a SQL agent: `run_sql` runs model-written SELECTs through `api/src/features/agent/sql-guard.ts` (user-scoped views via CTEs, every other table shadowed empty, lexer checks, row and time caps), plus `find_entities`, `link_transactions`, `show_chart`.
   - R2 replaces Storage; Workers AI replaces Groq; the Durable Object replaces Realtime; ffmpeg is gone (the iOS app records m4a).
   - Brevo stays because there is no owned domain for Cloudflare Email.

## Status (2026-10-10)

**Code-complete and verified locally:** audit phases 0–2 and 5–7, the Hono rewrite, agent v2, caching fixes, and the Cloudflare migration phases 1–7 (D1, auth, R2, Workers AI with the cost cap, agent on D1, live updates and frontend, config and docs). Work is **uncommitted** on the branch `feat/audit-and-workers-rewrite`. Nothing has been deployed.

Test counts: `api/` 913 tests passing, frontend 679 tests passing.

**Next steps:** the user follows `api/DEPLOY.md` (create D1 / R2 / queues, secrets, migrations, deploy) and `docs/rewrite/GO-LIVE.md` (production deploy, device test, new app build, then pause and delete Supabase).

**`EXPO_PUBLIC_API_BASE_URL` is origin-only.** Do not include `/api/v1`, because the app's paths already include it. `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` must also be listed in the Worker's `GOOGLE_WEB_CLIENT_ID`.

**Releases and OTA updates** (local APK build, self-hosted Expo Updates on the Worker, no EAS): see `docs/RELEASE.md`.

## Working rules (from the user)

- **Build each phase fully, then test.** Don't run tests after every small step. Run verification (typecheck, lint, tests, end to end where possible) once a big chunk or phase is complete.
- **Three-tier subagents for every batch of work:**
  1. **Explore** (Haiku 5.5, high effort): search, read, trace root causes (systematic debugging for bugs), report findings with file:line. No edits.
  2. **Implement** (Sonnet 5.5, high effort): one subagent implements the whole batch from the findings, fixing root causes at the shared component/hook.
  3. **Review** (Opus 5.5, low effort): one review of the whole batch diff at the end; the main session applies or relays fixes.
  - Test and review **once at the end of the batch**, never after each item.
- **No git commits or pushes** unless the user asks. Preserve uncommitted work-in-progress.
- **Match surrounding code style.** Don't reformat unrelated code.
- Windows dev machine: the Bash tool is Git Bash.

## Verification commands

- **API** (`api/`): `npm run typecheck`, `npm run lint`, `npm test` (Vitest with `@cloudflare/vitest-pool-workers`, real local D1), `npx wrangler deploy --dry-run`, `npx wrangler dev` (after `npx wrangler d1 migrations apply DB --local`).
- **Frontend** (`frontend/`): `npx tsc --noEmit`, `npm run lint`, `npm test`.
