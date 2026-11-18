-- Money safety (docs/MONEY-MODEL-FIX-PLAN.md, batch 2: R6 recurring and reminders, R8 other correctness).
--
-- 1. recurring_items.starts_on: the due date of the first period an item owes (its start, or its latest resume). The poster posts every
--    occurrence from there on that has no live row and no skip; `next_due_date` is now a cache of the first such occurrence. Existing
--    items start at their current pointer. The trigger fills it for a row written by an older Worker in the migrate-then-deploy window.
-- 2. recurring_skips: an occurrence the user deleted (the row is soft-deleted, then purged after 30 days: the skip must outlive it).
--    Seeded from the soft-deleted recurring postings that exist now.
-- 3. reminder_payments: what each transaction settled of a reminder occurrence (`due_date` = the occurrence). A transaction settles at
--    most one reminder (UNIQUE txn_id); a payment without a transaction (marked paid by hand with an amount) has txn_id NULL. This
--    replaces reminders.used_txn_ids, which stays as an unused column (a pre-deploy Worker still writes it). Seeded from the completed
--    and used transactions of existing reminders (due_date '' = an occurrence that is over, counted by no open one).
-- 4. transactions_deleted_idx: the hourly purge of soft-deleted transactions.

ALTER TABLE recurring_items ADD COLUMN starts_on TEXT;
UPDATE recurring_items SET starts_on = next_due_date;

CREATE TRIGGER recurring_items_starts_on_after_insert AFTER INSERT ON recurring_items
WHEN NEW.starts_on IS NULL
BEGIN
  UPDATE recurring_items SET starts_on = NEW.next_due_date WHERE id = NEW.id;
END;

CREATE TABLE recurring_skips (
  item_id    TEXT NOT NULL REFERENCES recurring_items (id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  occurrence TEXT NOT NULL CHECK (occurrence GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (item_id, occurrence)
);

INSERT OR IGNORE INTO recurring_skips (item_id, user_id, occurrence)
SELECT d.recurring_item_id, d.user_id, COALESCE(d.recurring_occurrence, d.local_date, substr(d.transaction_at, 1, 10))
FROM transactions d
WHERE d.recurring_item_id IS NOT NULL AND d.deleted_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM transactions l
    WHERE l.recurring_item_id = d.recurring_item_id AND l.deleted_at IS NULL
      AND COALESCE(l.recurring_occurrence, l.local_date, substr(l.transaction_at, 1, 10)) = COALESCE(d.recurring_occurrence, d.local_date, substr(d.transaction_at, 1, 10))
  );

CREATE TABLE reminder_payments (
  id           TEXT PRIMARY KEY,
  reminder_id  TEXT NOT NULL REFERENCES reminders (id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  txn_id       TEXT UNIQUE REFERENCES transactions (id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  due_date     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX reminder_payments_reminder_idx ON reminder_payments (reminder_id, due_date);
CREATE INDEX reminder_payments_user_idx ON reminder_payments (user_id);

INSERT OR IGNORE INTO reminder_payments (id, reminder_id, user_id, txn_id, amount_cents, due_date)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
         substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
       s.rid, s.uid, t.id, t.amount, s.due
FROM (
  SELECT r.id AS rid, r.user_id AS uid, r.completed_txn_id AS txn, CASE WHEN r.status = 'done' AND r.cadence = 'none' THEN r.due_date ELSE '' END AS due
  FROM reminders r WHERE r.completed_txn_id IS NOT NULL
  UNION ALL
  SELECT r.id, r.user_id, j.value, '' FROM reminders r, json_each(r.used_txn_ids) j WHERE r.used_txn_ids IS NOT NULL
) s
JOIN transactions t ON t.id = s.txn AND t.user_id = s.uid AND t.deleted_at IS NULL;

CREATE INDEX transactions_deleted_idx ON transactions (deleted_at) WHERE deleted_at IS NOT NULL;
