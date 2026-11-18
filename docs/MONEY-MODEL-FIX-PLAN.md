# Money model and loophole fixes (2026-11-15)

Source: a read-only audit of `api/` and `frontend/` (four explore passes). This file is the brief for the
implementation batches. File:line references are from the audit and may have drifted slightly.

## Decisions (made by the owner's delegate; do not re-open)

1. **Monthly budget** = flexible spend + spend posted by recurring items whose `counts_toward_budget = 1`.
   Recurring items default to `counts_toward_budget = 0` (rent, EMI, insurance are "committed", not budget).
2. **Paybacks** (reimbursements, refunds) reduce the spend of the month of the **original debit**, not the month
   the money arrived.
3. **"My share" splits**: not in this work. Leave room for it (offsets table supports it), build nothing.
4. **Cash withdrawals and credit-card bill payments** are `transfer` by default. Setting
   `count_cash_withdrawals_as_spend` (default 0) lets a user count ATM cash as spend.
5. **No FX conversion**: non-INR captures go to review, never auto-posted as rupees.
6. **API stays backward compatible** (contracts C1–C8, `docs/rewrite/parity-spec.md`): only additive fields and
   new endpoints. Existing fields keep their names; where a number's meaning changes (spent excludes transfers
   and is net of paybacks) that is the intended fix. Old app builds (1.5.0) must keep working.

## Root causes and their fixes

### R1. A transaction has no meaning beyond debit/credit, and nothing links transactions

- `transactions.kind TEXT NOT NULL CHECK (kind IN ('spend','income','transfer','payback'))`.
  - `kind` is the single field that decides how money counts. `counterparty_type` stays descriptive.
  - Default on write: debit -> `spend`, credit -> `income`; `counterparty_type = 'self_transfer'` -> `transfer`.
    Clients and the AI may set `kind` explicitly (manual form, capture parse). The AI prompt gains rules:
    self transfer / own account / ATM or cash withdrawal / credit-card bill payment -> `transfer`; refund /
    cashback / reversal -> `payback`.
  - Backfill in the migration: `self_transfer` rows -> `transfer`; debits -> `spend`; credits -> `income`.
  - Constraint: `payback` and `income` are credits; `spend` is a debit; `transfer` either.
- `transaction_offsets(id, user_id, credit_id, debit_id, amount_cents > 0, created_at)`; unique `(credit_id, debit_id)`.
  - Sum of offsets on a debit <= debit amount; sum on a credit <= credit amount (enforced in the service inside the
    write, plus tests). Both rows must belong to the user, be live, credit is a credit and debit is a debit.
  - Linking sets the credit's `kind = 'payback'` (when fully or partly linked); unlinking the last offset restores
    `income`.
  - Effective spend of a debit = amount − linked offsets. A payback credit's linked part is not income; an unlinked
    `payback` credit (refund with no matched debit) reduces spend of its own category in its own month.
  - Soft-deleting either side makes its offsets inert (the view joins live rows only); restoring brings them back.
  - Endpoints: `GET /api/v1/transactions/:id/offsets`, `POST /api/v1/transactions/offsets`
    `{credit_id, debit_id, amount}`, `DELETE /api/v1/transactions/offsets/:id`,
    `GET /api/v1/transactions/:id/payback-candidates` (for a credit: live debits in the last 45 days, amount >=
    remaining credit or within ±10%, payee match ranked first; for a debit: credits after it within 45 days).
  - Responses for a transaction gain `kind`, `offset_total`, `effective_amount`.

### R2. Every surface defines "spent" its own way

- One SQL definition, in one module (e.g. `transactions/ledger.ts`), used by every aggregate: home, month
  summary, month insights, insights rollups, top expenses, budget evaluator, digest payload, Broke Report data,
  and the agent's scoped `transactions` view (add `kind`, `local_date`, `effective_amount`, `counts_toward_budget`
  columns there and describe them in `agent/schema-context.ts` and prompts).
- Definitions (cents, live rows only):
  - `spend_cents` = Σ effective amount of `kind='spend'` debits − Σ unlinked part of `payback` credits.
  - `income_cents` = Σ `kind='income'` credits (a payback's linked part is excluded by kind).
  - `fixed` = row has `recurring_item_id` OR its category scope is not `spend`.
  - `budget_spend_cents` = spend of rows that are not fixed, plus fixed rows whose recurring item has
    `counts_toward_budget = 1`.
  - `committed_cents` = fixed spend not counted in budget.
  - Transfers are in neither spend nor income. They still appear in lists with their `kind`.
- Existing response fields keep their names: `spent_this_month`, `debit_total`, `debit_by_category`, etc. now use
  these definitions. New additive fields on home and month summary: `budget_spent`, `budget_left` (signed, may be
  negative), `committed_total`, `transfer_total`, `payback_total`, and the month's `monthly_budget` cap (from
  budget history, see R7).
- The client stops re-deriving budget math: Home, widget, Budgets, Insights and compare read server
  `budget_spent`/`budget_left` and overlay offline outbox rows through **one** shared helper.
- Top categories and payees: same rule on every surface (flexible spend only for "where it went"; fixed shown as
  committed). Broke Report and digest stop counting fixed and transfers (no rent "splurge").
- Insights headline is always "spent"; net is secondary.

### R3. Side effects run only on create

- `reconcileBudgetAlerts(db, emitter, settings, userId, months[])`: computes which thresholds are currently true for
  each affected month (monthly cap and every category cap, from the month's budget history), creates missing
  alerts, and retires (deletes) alerts that are no longer true. Only the **current local month** emits push/
  notification rows for newly crossed thresholds; past months are reconciled silently (retire only).
- Called (in `waitUntil`) after: transaction create / update (old and new month) / delete / restore, offset link /
  unlink, budget or category budget set / delete, recurring item `counts_toward_budget` change, recurring post.
- Replaces the create-only `notifyAfterInsert` budget path and the cap-blind dedupe key problem.

### R4. Idempotency and duplicate detection are the same mechanism

- Idempotency = exact retries only: request `Idempotency-Key` (manual), `job:<job_id>` hash (captures; check for an
  existing row for the job before calling the AI), and a partial unique index on
  `(user_id, recurring_item_id, recurring_occurrence)` for live rows (recurring posts; `recurring_occurrence` is
  the period's due date `YYYY-MM-DD`). A recurring-posted row's identity never changes on edit.
- Duplicate detection = a suggestion, never a silent merge: before insert, look for a live row with the same
  user, type, amount and payee on the same `local_date`.
  - Manual create: still inserts (201) but returns `possible_duplicate_of: <id>` so the app can offer "Undo / keep".
    (The old silent same-minute merge is removed; two real ₹20 teas both save.)
  - Captures: row inserted with `needs_review = 1` and the capture notification says "Possible duplicate".
- Manual entry matching a recurring item due within ±5 days (same payee or amount within 2%): response carries
  `possible_recurring: {item_id, occurrence}`; `POST /api/v1/recurring/:id/link` `{transaction_id, occurrence}` links
  it (sets `recurring_item_id` + `recurring_occurrence`), and the poster then skips that occurrence.

### R5. Local dates computed at read time from UTC

- `transactions.local_date TEXT` (`YYYY-MM-DD`) and `month_key TEXT` (`YYYY-MM`), computed on every write from
  `transaction_at` in the user's stored timezone; indexed `(user_id, local_date)`.
- Date-only captures (receipt with no time) take the parsed date as `local_date` directly and `transaction_at` at
  local noon (never UTC midnight).
- All day/month bucketing moves into SQL (`GROUP BY local_date`), removing the load-every-row path
  (`fetchAmountTypeAtRows`).
- Server surfaces use the user's stored timezone, not hard-coded IST: Broke Report, digest periods, agent quota
  day, alerts.
- Backfill: migration fills `local_date`/`month_key` in SQL for users on fixed-offset zones (Asia/Kolkata etc.)
  and a batched TS backfill (cron, `WHERE local_date IS NULL LIMIT n`) for the rest; reads must tolerate NULL only
  until the backfill completes (fallback to computing from `transaction_at`).

### R6. Recurring and reminder state is a moving pointer and app-only checks

- Recurring: occurrences are facts (the unique index above). The poster posts every due occurrence since the item's
  start / resume that has no live row and no skip; editing day, timezone or resume never loses the current period.
  `next_due_date` is a cache recomputed from that. Skips are stored (`recurring_skips(item_id, occurrence)`) if the
  current design does not already record them.
- Reminders: `reminder_payments(id, reminder_id, user_id, txn_id UNIQUE, amount_cents, created_at)`.
  - A transaction settles at most one reminder (DB unique).
  - Partial payments: completing with less than the due amount records a payment and keeps the reminder open with
    `paid_total`/`remaining` in the response; it closes when paid >= due.
  - Deleting the transaction removes its payment rows (service-level, since deletes are soft) and reopens the
    reminder occurrence if it is no longer covered.
  - "Looks paid" matches amounts <= remaining (not exact only).

### R7. Budgets are not month-scoped

- `budget_history(user_id, month_key, scope 'monthly'|'category', category_id, amount_cents)`: setting a budget
  writes the current month row (and applies to later months until changed). Past months keep their cap. Responses
  for a month use that month's cap. Existing `budgets`/`category_budgets` stay as the "current" values for
  backward compatibility.

### R8. Other correctness

- PATCH/DELETE accept optional `expected_updated_at`; mismatch -> 409 `{code:'stale'}`. PATCH applies only fields
  sent.
- Input bounds: amount > 0, <= 1,00,00,000.00, at most 2 decimals (reject, do not round); `transaction_at` not more
  than 1 day in the future, not before 2000-01-01.
- Capture: AI output gains `currency`; non-INR -> job `needs_review`, notification asks for the rupee amount; no
  row with a foreign amount is posted as INR. Voice failures emit `capture_failed` like receipts. Low parse
  confidence (< threshold already logged) -> `needs_review = 1`.
- Sweep requeue timeout exceeds worst-case processing (≥ 10 min).
- Restore: `POST /api/v1/transactions/:id/restore`. Purge: soft-deleted transactions and their R2 media after 30
  days (hourly purge job, batched).
- Digest fan-out: shared fan-out helper with the report (per-chunk try/catch, days 1–3 catch-up, keyset paging
  `user_id > ?`); a `pending` claim older than 5 minutes is retryable.
- Category delete reports that its category budgets are removed (delete-impact).
- `/pay` and `payLinks.ts`: block only names that impersonate Dime (exact "dime" word / brand), not substrings like
  "Dimple".
- Payee keys keep non-Latin names (Unicode letters), server and client (`normalizePayeeKey`) identical.

### R9. Frontend

- Manual add/edit: kind selector (Spend / Income / Transfer; Payback via linking), strict amount parsing
  everywhere (`parseAmountInputToPaise`), `expected_updated_at` on edit/delete with a "changed on another device"
  refresh on 409, `possible_duplicate_of` and `possible_recurring` prompts after save.
- Transaction detail: "Paid back" section: link a credit to a debit (candidates endpoint), show offsets, unlink.
  When a person credit is saved, offer "Paying you back for something?".
- Recurring editor: "Counts toward monthly budget" switch.
- Home / widget / Budgets / Insights / compare: read server `budget_spent`, `budget_left` (signed: show "₹X over"),
  `committed_total`; one shared pending-outbox overlay helper; past months use the month's cap.
- Undo toast (5 s) after delete -> restore endpoint. Outbox supports update and delete with
  `expected_updated_at`; stale replays are dropped with a toast.
- Insights headline always "Spent". Realtime echo suppression only drops events whose `updated_at` equals the
  local mutation's.
- Reminders: show paid/remaining; complete with a partial amount.
- Agent chat history keeps assistant replies (last 3 exchanges).

## Batches

1. **API money model**: R1, R2 (server), R3, R4, R5, R7 + agent views. Migration `0017_*`.
2. **API safety**: R6, R8.
3. **Frontend**: R9 and every client consumer of the new fields.

Each batch: implement fully, then `npm run typecheck`, `npm run lint`, `npm test` (api) or `npx tsc --noEmit`,
`npm run lint`, `npm test` (frontend). Add table-driven scenario tests: hotel payback (full, partial, two payers,
across months), transfers excluded, refund without a match, recurring counts-toward-budget, edit across months
re-alerts and retires, delete retires alerts, cap raise then re-cross, recurring re-plan keeps the period,
double recurring post impossible, reminder double settle rejected, partial reminder, job re-run single row,
same-minute real duplicates both save, receipt vs manual flagged duplicate, stale PATCH 409, bounds rejected.
