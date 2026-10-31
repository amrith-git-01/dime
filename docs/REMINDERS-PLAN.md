# Reminders

Status: **building** (2026-10-31). Money reminders for paying and receiving: one-off or repeating, lead days before the due
date, optional overdue nudges, push + inbox, a "looks paid" suggestion when a matching transaction shows up, and UPI links
(share a pay link, "Pay now"). No people ledger in this version (no partial payments, no balances).

## Decisions (locked)

- One `reminders` table: `direction` pay|receive, optional amount, optional name, due date, repeat, lead days, time.
- Recurring items (rent, salary, subscriptions) get **opt-in** lead-day reminders (`remind_lead_days`; NULL = off), so
  nobody's existing items start buzzing without asking.
- Delivery: server push from the existing 5-minute cron (`scheduled()` SWEEP tick). No local scheduling.
- Timezone: store `user_settings.timezone` (IANA, written by the app at bootstrap); each reminder also stores its own
  `timezone` at creation. Fallback `Asia/Kolkata`.
- "Looks paid" is a **suggestion** computed when listing (never a silent close), so it works for every capture path
  (manual, scan, voice, recurring, credits) with no insert hook.
- UPI: optional `user_settings.upi_id` (my UPI ID) and optional `reminders.upi_id` (payee). A public Worker page
  `GET /pay` redirects an https link to `upi://pay?...` (WhatsApp does not linkify `upi://`). Pay now opens `upi://`
  directly from the app (try/catch around `Linking.openURL`, no native change).
- Entry points: Home Upcoming header, Budgets Recurring section, Get Started card. NOT the radial + menu.
- Notification buttons (Mark paid, Snooze) are out of scope for v1.

## Data model (migration `0015_reminders.sql`)

`reminders`:
`id, user_id (FK cascade), direction CHECK('pay','receive'), title (<=80), amount INTEGER NULL (cents, >0),
counterparty_name NULL, payee_key NULL (via payeeKey(normalizedOrNull(name), name)), upi_id NULL, due_date TEXT (local
YYYY-MM-DD), cadence CHECK('none','weekly','monthly','yearly') default 'none', anchor_day INTEGER (requested day of
month, clamped when computed, like recurring items), lead_days TEXT NULL (JSON int array 0..30, NULL = user default),
remind_time TEXT NULL ('HH:MM', NULL = user default), timezone TEXT NOT NULL, status CHECK('open','done','dismissed')
default 'open', completed_at NULL, completed_txn_id NULL (FK transactions SET NULL), fired_through TEXT NULL (ISO of the
last instant already sent), next_fire_at TEXT NULL (UTC ISO; NULL when nothing is left), created_at, updated_at`.
Indexes: `(next_fire_at) WHERE status='open' AND next_fire_at IS NOT NULL`, `(user_id, status, due_date)`.

`recurring_items`: `ADD COLUMN remind_lead_days TEXT NULL` (JSON int array or NULL = off), `ADD COLUMN next_remind_at
TEXT NULL` (+ partial index). `next_remind_at` is recomputed whenever `next_due_date` or `remind_lead_days` changes
(create, update, poster advance).

`user_settings` adds: `reminders_enabled` (1), `reminder_default_lead_days` (TEXT JSON, default '[3,1,0]'),
`reminder_time` ('09:00', same CHECK as `daily_expense_reminder_time`), `reminder_overdue_nudges` (INTEGER 2, 0..5),
`reminder_quiet_enabled` (0), `reminder_quiet_start` ('22:00'), `reminder_quiet_end` ('08:00'),
`reminder_hide_amounts` (0), `upi_id` (TEXT NULL; PATCH accepts '' to clear because null means unchanged),
`timezone` (TEXT NULL, IANA). The lead-days list is JSON-stringified in `service.patch` and excluded from `patchFields`
like `card_layouts`.

`notifications` is rebuilt again (copy-and-swap exactly like 0014, create `reminders` first): kind adds
`reminder_due`; action_type adds `reminder`; new column `action_reminder_id TEXT REFERENCES reminders(id) ON DELETE SET
NULL`; keep `action_period_key`; recreate `notifications_user_created_idx`. No triggers or views (sql-guard test).
`reminders` goes into `SHADOWED_TABLES`; add it to the test `resetDb` list before `transactions`.

## Schedule semantics (pure module, unit-tested)

For a reminder with due date D (local), time T, lead days L, overdue nudges N, timezone Z:
fire instants = `{ D - l days at T : l in L }` ∪ `{ D + k days at T : k = 1..N }` (overdue nudges only for `open`
reminders). `l = 0` means "due today". An instant inside quiet hours moves to the quiet end. `next_fire_at` = the first
instant `> fired_through` (or `> now` when creating). When several instants are already due (e.g. the cron was down),
**send only the latest one** and set `fired_through` to it. After the last instant the reminder has nothing left:
`next_fire_at = NULL`. Repeating reminders: when the schedule is exhausted (or on `complete`/`skip`), advance `due_date`
to the next occurrence (weekly +7 days; monthly/yearly with `anchor_day` clamping; never backfill into the past),
reset `fired_through`, recompute. `cadence = none`: `complete` sets `status = done`.
Dedupe key for the notification: `reminder:<id>:<due_date>:<step>` where step is `l<n>` for lead days and `o<k>` for
overdue nudges (recurring items: `reminder:rec:<itemId>:<next_due_date>:l<n>`). A conflict inserts and sends nothing.

## Behaviours added in review

- **Recurring leads are 1..30** (not 0): the poster posts an item and moves it on at 06:00 local on its due date, so a "due today" step could never be sent. A recurring step whose instant (after quiet-hours shifting) is at or after that 06:00 is dropped. Reminders keep 0..30.
- **Lead days vs cadence:** weekly max 6, monthly/yearly max 27 (422 on create/PATCH, also when a cadence change would leave stored leads too long); the user's default list is 0..27. A default lead beyond a reminder's cadence cap is ignored for that reminder.
- **Quiet hours never push a lead step past the due date:** an evening `l0` that would move to the next morning is sent at the minute before the quiet window starts instead. Overdue nudges may still move to the next morning.
- **Settings changes re-plan:** a PATCH of any `reminder_*` field, `reminders_enabled` or `timezone` recomputes `next_fire_at` of the user's open reminders and `next_remind_at` of their active recurring items with leads (batched updates; `fired_through` kept).
- **Looks paid:** one batched query with a window per reminder (JSON of windows joined to `transactions`, one row per reminder via a window function), so no row limit can hide a match. Transactions already used to complete a reminder (`used_txn_ids`, latest 10, plus `completed_txn_id`) are never suggested again.
- **Cron cap:** `sendDueReminders` handles at most 60 rows per tick in total (reminders first by `next_fire_at`, then recurring items with what is left); the log says how many were left over.
- **`/pay`:** no script and no automatic redirect: the visitor taps "Open your UPI app". Every valid page says "This link was not created by Dime. Check the UPI ID before paying." A `pn` containing "dime" (any case) is rejected like any invalid link. The CSP is `default-src 'none'; style-src 'nonce-...'` only.

## Cron

`sendDueReminders(env, nowMs)` in `features/reminders/sender.ts`, added to the SWEEP tick's `Promise.allSettled` in
`src/index.ts`. Select open reminders with `next_fire_at <= now` (limit 50, order by `next_fire_at`) plus recurring items
with `next_remind_at <= now` (limit 50), per-row try/catch (one failure never blocks others), log structured counts.
For each row: read the user's settings (skip when `reminders_enabled = 0`, but still advance the schedule), emit
`reminder_due`, advance. Order of writes: emit first, then advance (a crash re-sends at worst, and the dedupe key makes the
re-send a no-op).

Notification copy (fixed English, tone is client-side only for the nudge message): title like `Rent due in 2 days` /
`Rent due today` / `Rent is 1 day overdue`; body `₹15,000 to Landlord` (or `Open Dime to see the amount.` when
`reminder_hide_amounts`). Receive direction: `Salary expected in 2 days`, `Ravi's ₹800 is 1 day late`.
Push data adds `reminder_id`; `NotificationResponse.action` adds `reminder_id` only for reminder actions (same pattern as
`period_key`).

## HTTP API (`features/reminders`, mounted at `/reminders`, all `requireAuth`)

- `GET /` `?status=open|done|all` (default open), `limit` (default 100). Each item: id, direction, title, amount (decimal
  string or null), counterparty_name, upi_id, due_date, cadence, lead_days (stored or null), effective_lead_days,
  remind_time, timezone, status, completed_at, next_fire_at, `suggested_match` (see below) or null.
- `POST /` create (zod; `timezone` required; `amount` optional; `lead_days` optional; computes `payee_key`,
  `next_fire_at`; rejects a due date more than 1 day in the past). `PATCH /:id` (recompute the schedule when date, cadence,
  lead days, time or status changes). `DELETE /:id`.
- `POST /:id/complete` body `{ transaction_id? }` (validates the transaction belongs to the user); `POST /:id/skip`
  (repeating only: advance without completing).
- `suggested_match`: for open reminders with a `payee_key` and/or an amount, the best matching non-deleted transaction of
  the right type (pay = debit, receive = credit) in `[due_date - 7, due_date + 14]` days with payee_key equal (when the
  reminder has one) and amount equal (when it has one); at least one of the two must be present. One batched query, not
  one per reminder. Shape `{ transaction_id, amount, display_name, date }`.
- Recurring routes accept and return `remind_lead_days` (int array 0..30, max 5, or null).
- `GET /pay` (public page, NOT under `/api/v1`; see below). Check that the Worker receives it (assets run_worker_first is
  off, so only real asset paths are served statically).

### `/pay` page

Query `pa` (UPI ID, regex `^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,32}$`), `am` (optional, decimal <= 2 places, 0.01..1,000,000),
`pn` (optional, <= 40 chars, letters/digits/space/.-), `tn` (optional, <= 80 chars). Invalid input returns a small static
"This payment link isn't valid" page (400). A valid request returns HTML that shows "Pay ₹{am} to {pn}", a button linking to
`upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...` (values URL-encoded, HTML-escaped), the UPI ID in plain text and the not-created-by-Dime notice (no script). No storage, no cookies, no third-party assets, `Cache-Control: no-store`,
`X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, a strict CSP (inline style/script via nonce or hashes). Never echo
unvalidated input. Rate limit it with an existing limiter binding if one fits.

## App (phase B, after the API is merged)

Reminders list screen (Due / Upcoming / Done, "Looks paid" chip with a Mark paid action), Reminder editor (direction toggle,
amount, title, name, optional UPI ID, due date, repeat, lead-day chips, time, overdue nudges), Home Upcoming card merges
recurring items and reminders with a "See all" and a "+", Budgets Recurring editor gets lead-day chips, Get Started entry,
Settings -> Notifications card (enable, default lead days, time, overdue nudges, quiet hours, hide amounts, My UPI ID),
timezone written at bootstrap, notification kind/action handling, deep link `dime://reminders`, the nudge message (Share
sheet, Gentle/Spicy/Savage via the existing roast level, includes the `/pay` link when My UPI ID and an amount exist),
Pay now (`upi://` via `Linking.openURL` in try/catch with a friendly toast), "Settle reminder?" action toast after a manual
add when `suggested_match` points at the new transaction.

## Tests

API: schedule module (leads, overdue, quiet hours, collapse-to-latest, month clamping, weekly/monthly/yearly advance,
timezone), routes (CRUD, validation, suggested_match for debit/credit, complete/skip), sender (due selection, dedupe,
alerts off, hide-amounts copy, one failure isolated, recurring lead reminders, idempotent re-run), settings (new fields,
clear UPI ID with ''), notification rebuild constraints, `/pay` (valid, every invalid param, XSS attempt, headers),
sql-guard shadowing.
