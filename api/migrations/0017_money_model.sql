-- Money model (docs/MONEY-MODEL-FIX-PLAN.md, batch 1). One definition of "spent" for every surface.
--
-- 1. transactions.kind: how a row counts. spend (debit), income (credit), payback (credit that gives money back for a spend:
--    refund, reimbursement) or transfer (own account, ATM cash, card bill; either direction, in neither spend nor income).
--    `type` stays the direction. The direction check lives in a trigger (a column CHECK cannot be added with ALTER and
--    existing rows start as 'spend'); the AFTER INSERT / AFTER UPDATE OF type triggers repair a row written or flipped without a kind
--    by an older Worker during the migrate-then-deploy window (they never abort that Worker's request).
-- 2. transactions.local_date / month_key: the calendar day and month of the row in the user's timezone, computed on write.
--    NULL until backfilled: this migration fills fixed-offset zones (and users with no stored timezone, who were always
--    reported in IST); the cron backfills the rest in batches (features/transactions/backfill.ts).
-- 3. transactions.recurring_occurrence: the period's due date (YYYY-MM-DD) of a recurring posting. Together with
--    recurring_item_id it is the identity of the row: a live row per (user, item, occurrence) at most.
-- 4. transactions.payment_hash is now an idempotency identity only ('job:<job id>' for captures): unique for those, no longer a
--    content fingerprint (hashes an older Worker wrote stay unique until it is gone). Two real Rs 20 teas in one minute are two rows; duplicate detection is a suggestion in the service.
-- 5. transactions.needs_review: a capture the user should look at (possible duplicate).
-- 6. transaction_offsets: a credit pays back (part of) a debit. Both sides must be live for it to count (the ledger joins live rows).
-- 7. budget_history: the cap in force per month; setting a budget writes the current month and applies from then on.
--    Seeded from the current budgets at the earliest month so existing users keep their caps for every past month.
-- 8. budget_alert_marks: see the table.
-- 9. recurring_items.counts_toward_budget (default 0: rent, EMI, insurance are committed, not budget) and
--    user_settings.count_cash_withdrawals_as_spend (default 0).

ALTER TABLE transactions ADD COLUMN kind TEXT NOT NULL DEFAULT 'spend' CHECK (kind IN ('spend', 'income', 'transfer', 'payback'));
ALTER TABLE transactions ADD COLUMN local_date TEXT;
ALTER TABLE transactions ADD COLUMN month_key TEXT;
ALTER TABLE transactions ADD COLUMN recurring_occurrence TEXT;
ALTER TABLE transactions ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0, 1));

UPDATE transactions
SET kind = CASE
  WHEN counterparty_type = 'self_transfer' THEN 'transfer'
  WHEN type = 'debit' THEN 'spend'
  ELSE 'income'
END;

-- A row an older Worker writes during the migrate-then-deploy window carries no kind (the column default 'spend'): repair it by the
-- same rule the service uses (self transfer -> transfer, credit -> income, debit -> spend). A kind the new Worker chose is left alone.
CREATE TRIGGER transactions_kind_after_insert AFTER INSERT ON transactions
WHEN (NEW.type = 'credit' AND NEW.kind = 'spend') OR (NEW.type = 'debit' AND NEW.kind IN ('income', 'payback'))
  OR (NEW.kind = 'spend' AND NEW.counterparty_type = 'self_transfer')
BEGIN
  UPDATE transactions SET kind = CASE
    WHEN NEW.counterparty_type = 'self_transfer' THEN 'transfer'
    WHEN NEW.type = 'credit' THEN 'income'
    ELSE 'spend'
  END WHERE id = NEW.id;
END;

-- Setting a kind that does not fit the direction is refused (only a writer that names `kind` can hit this; the older Worker never does).
CREATE TRIGGER transactions_kind_before_update BEFORE UPDATE OF kind ON transactions
WHEN NOT ((NEW.kind = 'spend' AND NEW.type = 'debit') OR (NEW.kind IN ('income', 'payback') AND NEW.type = 'credit') OR NEW.kind = 'transfer')
BEGIN
  SELECT RAISE(ABORT, 'transaction kind does not match its direction');
END;

-- An older Worker's PATCH can flip `type` without a kind: rewrite a kind that no longer fits (never abort that request).
CREATE TRIGGER transactions_kind_after_type_update AFTER UPDATE OF type ON transactions
WHEN NOT ((NEW.kind = 'spend' AND NEW.type = 'debit') OR (NEW.kind IN ('income', 'payback') AND NEW.type = 'credit') OR NEW.kind = 'transfer')
BEGIN
  UPDATE transactions SET kind = CASE
    WHEN NEW.counterparty_type = 'self_transfer' THEN 'transfer'
    WHEN NEW.type = 'credit' THEN 'income'
    ELSE 'spend'
  END WHERE id = NEW.id;
END;

-- An older Worker posts a recurring occurrence with payment_hash = 'recurring:<item uuid>:<YYYY-MM-DD>' and no recurring_occurrence:
-- fill it so the occurrence unique index below covers those postings too (a clash aborts that insert, as the old hash index did).
CREATE TRIGGER transactions_recurring_occurrence_after_insert AFTER INSERT ON transactions
WHEN NEW.recurring_occurrence IS NULL AND NEW.recurring_item_id IS NOT NULL AND NEW.payment_hash LIKE 'recurring:%' AND length(NEW.payment_hash) = 57
BEGIN
  UPDATE transactions SET recurring_occurrence = substr(NEW.payment_hash, 48) WHERE id = NEW.id;
END;

-- Local dates for users on fixed-offset zones, and for users with no stored timezone (IST, what every report assumed).
CREATE TABLE tz_fixed_offsets (tz TEXT PRIMARY KEY, minutes INTEGER NOT NULL);
INSERT INTO tz_fixed_offsets (tz, minutes) VALUES
  ('UTC', 0), ('Etc/UTC', 0), ('GMT', 0), ('Africa/Abidjan', 0), ('Africa/Accra', 0),
  ('Africa/Lagos', 60), ('Africa/Nairobi', 180), ('Africa/Johannesburg', 120), ('Africa/Cairo', 120),
  ('Asia/Kolkata', 330), ('Asia/Calcutta', 330), ('Asia/Colombo', 330), ('Asia/Kathmandu', 345),
  ('Asia/Dhaka', 360), ('Asia/Karachi', 300), ('Asia/Dubai', 240), ('Asia/Riyadh', 180), ('Asia/Qatar', 180),
  ('Asia/Bangkok', 420), ('Asia/Jakarta', 420), ('Asia/Ho_Chi_Minh', 420), ('Asia/Singapore', 480),
  ('Asia/Kuala_Lumpur', 480), ('Asia/Manila', 480), ('Asia/Hong_Kong', 480), ('Asia/Shanghai', 480),
  ('Asia/Taipei', 480), ('Asia/Tokyo', 540), ('Asia/Seoul', 540);

UPDATE transactions
SET local_date = date(transaction_at, o.m), month_key = strftime('%Y-%m', transaction_at, o.m)
FROM (
  SELECT u.id AS uid, printf('%+d minutes', COALESCE(f.minutes, 330)) AS m
  FROM users u
  LEFT JOIN user_settings s ON s.user_id = u.id
  LEFT JOIN tz_fixed_offsets f ON f.tz = s.timezone
  WHERE s.timezone IS NULL OR s.timezone = '' OR f.tz IS NOT NULL
) AS o
WHERE o.uid = transactions.user_id;

DROP TABLE tz_fixed_offsets;

-- Recurring postings used payment_hash = 'recurring:<item uuid>:<YYYY-MM-DD>': that date is the occurrence.
UPDATE transactions
SET recurring_occurrence = substr(payment_hash, 48)
WHERE recurring_item_id IS NOT NULL AND payment_hash LIKE 'recurring:%' AND length(payment_hash) = 57;

-- The old content-fingerprint index becomes two: captures ('job:<id>') stay unique, and every other hash an older Worker wrote
-- (content fingerprints, 'recurring:...') keeps the race protection that Worker relies on until it is replaced. The new Worker writes
-- no other hash, so the second index costs it nothing (and can be dropped once the old Worker is gone).
DROP INDEX transactions_user_payment_hash_uniq;
CREATE UNIQUE INDEX transactions_user_job_hash_uniq ON transactions (user_id, payment_hash)
  WHERE payment_hash LIKE 'job:%' AND deleted_at IS NULL;
CREATE UNIQUE INDEX transactions_user_legacy_hash_uniq ON transactions (user_id, payment_hash)
  WHERE payment_hash IS NOT NULL AND payment_hash NOT LIKE 'job:%' AND deleted_at IS NULL;
CREATE UNIQUE INDEX transactions_recurring_occurrence_uniq ON transactions (user_id, recurring_item_id, recurring_occurrence)
  WHERE recurring_occurrence IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX transactions_user_local_date_idx ON transactions (user_id, local_date) WHERE deleted_at IS NULL;
CREATE INDEX transactions_local_date_pending_idx ON transactions (id) WHERE local_date IS NULL;
-- The cron's repair of payee keys the old ASCII-only normaliser filed under 'unknown' (features/transactions/backfill.ts).
CREATE INDEX transactions_payee_unknown_idx ON transactions (id) WHERE payee_key = 'unknown' AND counterparty_name <> '';
CREATE INDEX transactions_user_dupe_idx ON transactions (user_id, payee_key, local_date) WHERE deleted_at IS NULL;

CREATE TABLE transaction_offsets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  credit_id  TEXT NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  debit_id   TEXT NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (credit_id, debit_id),
  CHECK (credit_id <> debit_id)
);
CREATE INDEX transaction_offsets_debit_idx ON transaction_offsets (debit_id);
CREATE INDEX transaction_offsets_user_idx ON transaction_offsets (user_id);

CREATE TABLE budget_history (
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  month_key   TEXT NOT NULL CHECK (month_key GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  scope       TEXT NOT NULL CHECK (scope IN ('monthly', 'category')),
  category_id TEXT REFERENCES categories (id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((scope = 'category') = (category_id IS NOT NULL))
);
CREATE UNIQUE INDEX budget_history_uniq ON budget_history (user_id, month_key, scope, COALESCE(category_id, ''));
CREATE INDEX budget_history_user_scope_idx ON budget_history (user_id, scope, month_key);

INSERT INTO budget_history (user_id, month_key, scope, category_id, amount_cents)
SELECT user_id, '2000-01', 'monthly', NULL, monthly_budget FROM budgets;
INSERT INTO budget_history (user_id, month_key, scope, category_id, amount_cents)
SELECT user_id, '2000-01', 'category', category_id, monthly_amount FROM category_budgets;

-- The cap in force when a budget alert was last raised: retiring an alert deletes its notification row, this keeps the memory that the
-- threshold was already announced for that cap (so oscillating edits do not push again; changing the cap does).
CREATE TABLE budget_alert_marks (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  cap_cents  INTEGER NOT NULL,
  PRIMARY KEY (user_id, dedupe_key)
) WITHOUT ROWID;

ALTER TABLE recurring_items ADD COLUMN counts_toward_budget INTEGER NOT NULL DEFAULT 0 CHECK (counts_toward_budget IN (0, 1));
ALTER TABLE user_settings ADD COLUMN count_cash_withdrawals_as_spend INTEGER NOT NULL DEFAULT 0 CHECK (count_cash_withdrawals_as_spend IN (0, 1));
