# Backend rewrite: behavioural parity spec

> **Infra note (2026-10-10):** the app moved off Supabase to D1, R2, Workers AI and its own Google sign-in (see `api/DEPLOY.md`). This file still describes the observable HTTP behaviour; storage terms below (PostgREST 409, Hyperdrive, RLS) map to D1 equivalents (a unique-constraint error, a D1 outage). The Python `backend/` is reference only: it targets Supabase and cannot run against the new stack.

The TypeScript/Hono API (`api/`) must reproduce these behaviours of the fixed Python backend (`backend/`, 303 tests passing).

- **Source of truth:** where this file is silent, the Python code and its tests are.
- **API contracts:** C1–C8 are in the plan, `C:\Users\selva\.claude\plans\now-i-need-to-radiant-backus.md`.
- **Workers changes are allowed.** Implementation can change for Workers (Queues instead of in-memory queues, `waitUntil` instead of tasks). **Observable behaviour may not change:** HTTP shapes, status codes and DB effects.

## Idempotency (C2)
- **Header:** `Idempotency-Key`.
  - Valid keys match `^[A-Za-z0-9][A-Za-z0-9_.-]{7,99}$`.
  - Absent or blank means no idempotency.
  - Malformed returns 422.
- **Scope:** `(user_id, key)`, backed by a unique index `jobs (user_id, idempotency_key) where idempotency_key is not null`.
- **Receipt / voice:**
  1. Look up the key **before** reading the body or uploading. If found, return 202 `{"accepted": true, "job_id": "<the existing job>"}` with no side effects.
  2. Otherwise upload, then insert the job with the key.
  3. If the insert hits a unique violation, return 202 (with the winner's `job_id`) and delete the uploaded object (best effort).
  4. If the insert fails for any other reason, delete the object and propagate the error.
- **Job status (added 1.2.0):** a receipt / voice 202 is `{"accepted": true, "job_id": "<id>"}`. `GET /api/v1/ingest/jobs/:id` (auth, no rate limiter) answers `{"status": "pending"|"processing"|"done"|"failed", "transaction"?: {id, amount, type, counterparty_name, category}}`. `transaction` comes from the job's `result.transaction_id` (a payment-hash duplicate names the existing row) and is omitted when the row was deleted since. 404 for another user's job, an unknown id or a `manual_create` record. The Android widget's capture card polls it.
- **SMS and notification capture were removed (2026-10):** no `/sms` route and no `sms` job kind. Old `sms` / `notification` values in `detected_via` stay valid for existing rows.
- **Manual `POST /transactions`:** the key is claimed through a `jobs` row with kind `manual_create`, status `processing`, attempts 1.
  - **Success:** `status=done`, `result={"status_code":201,"body":{"accepted":true,"id":"<transaction id>","created":true}}`. A replay returns that status and body.
  - **Concurrent duplicate:** 409 "A request with this Idempotency-Key is still being processed."
  - **Re-claim:** a `failed` row, or a `processing` row with `updated_at` older than 600 s, can be re-claimed with a conditional update.
  - **Action raises:** `status=failed`, `last_error` set, error propagated.
- **Payload mismatch** for the same key is not detected; the original response is replayed.

## Jobs lifecycle
- **Table `jobs`:** `id`, `user_id`, `kind`, `payload`, `status` (pending|processing|done|failed), `attempts`, `last_error`, `idempotency_key`, `result`, `created_at`, `updated_at`.
  - `updated_at` is set explicitly on every write.
  - RLS on, no policies (service role only).
- **Kinds:** `receipt`, `voice` (queued) and `manual_create` (idempotency record only).
- **Payloads never contain media bytes:**
  - receipt / voice: `{object_path, mime_type, timezone}`
- **Media upload:** media goes to the **private bucket** first. Path: `{kind}/{user}/{kind}/{YYYY-MM-DD}/{ms}-{8hex}.{ext}`, where kind is `receipts` or `voice_inputs`.
  - `receipt_url` / `voice_url` store the object path.
  - Voice stores the raw file.
- **Enqueue:**
  1. Insert all rows for the batch in one statement (all or nothing).
  2. Send the ids to the Queue.
  3. If sending fails after the insert, rows stay `pending` for recovery.
  4. Python returned 503 with `Retry-After` when its in-memory queue was full. Cloudflare Queues have no small capacity limit, so return 503 only if `send` fails before the insert.
- **Claim:** a conditional update `pending -> processing`, `attempts+1`, guarded by `status = pending`. Only one claimant wins, so duplicate messages are harmless.
  - If `attempts >= max` (3), the job is marked failed with "max attempts exceeded".
- **Outcome:**
  - **Success:** `done`, `result={"transaction_id": ...}`.
  - **Error:** `failed`, `last_error` truncated to 500 chars.
  - **Transient upstream errors** are retried in-handler: 3 attempts, backoff 1 s then 2 s. In Workers, prefer `message.retry({delaySeconds})` with the DLQ after max retries, as long as the observable job status ends the same.
  - **Failure notification:** handler failure emits a `capture_failed` notification (receipt source `scan`), deduped per day. Voice failures emit none.
- **Recovery:** pending/processing rows with `updated_at < now - 300s` get re-sent, oldest first.
  - For `processing` rows, first run a conditional update `processing -> pending` where `updated_at < cutoff`.
  - In Workers this is a periodic sweep: a cron, e.g. every 5 min, re-sending to the queue.

## Email claim / reclaim
- **`email_sends`:** unique key `(user_id, kind, period_key)`, plus `claimed_at`.
- **Claim:** insert `status=pending`, `claimed_at=now`.
  - **Only** a unique violation (23505 / PostgREST 409) means "already claimed". Any other error, including network errors, propagates.
  - After a unique violation, try to reclaim: update `claimed_at=now` where `status=pending` and `claimed_at < now - 30 min`. The reclaim succeeds only if a row was updated.
- **Send success:** `status=sent`, `sent_at`, `brevo_message_id`.
- **Send failure:** delete the pending row.
- **Welcome email:** kind `welcome`, period_key `once`.
- **Weekly / monthly:** period keys as in `backend/features/email/periods.py`.

## `GET /me` and the welcome email
- Write the user's email only when it differs from the stored value.
- Attempt the welcome email only if the users row was missing or the email changed. `email_sends` still guarantees it is sent once.
- Fire-and-forget, via `ctx.waitUntil`.

## Dedupe keys
- **Notifications:** unique `(user_id, dedupe_key)`.
  - Insert with on-conflict ignore. A conflict returns no row, so **no push** is sent.
  - A soft-deleted notification still occupies its key.
  - Key formats:
    - `transaction_auto:{tx_id}`
    - `capture_failed:{source}:{YYYY-MM-DD}`
    - `budget:{scope}:{threshold}:{period_key}`
    - `budget:category:{category_id}:{threshold}:{period_key}`
- **`transactions.payment_hash`:** sha256 of the canonical JSON `{"amount":"%.2f","counterparty":normalized,"minute":"YYYY-MM-DDTHH:MM" (UTC),"type":...}`. Keys are sorted, separators `,` and `:` with no spaces. It must be byte-identical to Python's, so existing hashes match.
  - **On create:** a hash hit does a sparse merge of missing fields.
  - **On edit:** recompute the hash. A clash with another active transaction returns 409. A legacy row with no hash that would clash leaves its hash null.

## Ranges and filters
- **`GET /transactions`:** `transaction_at >= from AND < to` (half-open).
- **Optional filters (C3):**
  - `category_id`
  - `payee`: case-insensitive contains, matched against `counterparty_normalized` (and the name/merchant fallback, as Python does). The app sends a normalized payee key and re-applies the exact match on the client.
- **Month summary, insights and home** use `[month_start, next_month_start)` in the user's timezone. Home "today" is `[today 00:00, tomorrow 00:00)`.
- **`transactions_period_summary` RPC:** called with half-open bounds.

## Other
- **`GET /transactions/{uuid}`:** 404 unless the transaction is active and owned by the user. Media URLs are signed for 6 h (batch-signed for lists).
- **Categories PATCH (C1):**
  - All fields optional; an empty body returns 422. `name` is 1–40 chars.
  - `budget_amount` has three states:
    - **absent:** untouched
    - **`null`:** delete the budget if one exists
    - **a value:** a decimal ≥ 0, at most 12 digits and 2 decimal places, no NaN or Infinity → upsert
  - **Present `budget_amount`:** call the RPC `update_category_with_budget(p_user_id, p_category_id, p_name, p_icon_name, p_color, p_set_budget, p_budget_amount)`, which returns `{category, monthly_amount}`.
  - **Errors:** P0002 → 404, 23505 → 409.
  - **System categories:** name, icon or color changes return 403; a budget-only change is allowed.
  - **Response:** includes `budget_amount` as a 2-decimal string, or null.
- **Category delete with reassign:** updates only `category_id`.
- **Error mapping:**
  - not found → 404
  - conflict → 409
  - validation → 422 (FastAPI-compatible `{"detail": ...}`)
  - unavailable → 503 with `Retry-After`
  - anything else → 500 `{"detail":"Internal error","request_id"}`
- **Agent chat:** 503 with `Retry-After` while the DB (D1) is unavailable.

## DB assumptions (the user verifies these against the real schema)
- `categories(id, user_id, name, icon_name, color, is_system)`
- `category_budgets(user_id, category_id, monthly_amount, updated_at)`, unique `(user_id, category_id)`
- `notifications` has `dedupe_key`, `deleted_at`, `created_at`
- `transactions.payment_hash` exists
- `users.email` exists
