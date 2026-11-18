-- Drop the guards 0017/0018 added only for the migrate-then-deploy window, now that every writer is the money-model Worker.
--
-- 1. The repair triggers for rows an older Worker wrote without a kind, without a recurring_occurrence, or without starts_on:
--    the service now sets all three on every write. Kind/direction stays enforced in the database by two BEFORE triggers that
--    refuse a mismatch (insert and update of kind or type), instead of silently rewriting it.
-- 2. transactions_user_legacy_hash_uniq: it backed the older Worker's content-hash dedupe races. New rows carry only job:<id>
--    hashes (own unique index) or none; recurring postings are unique by occurrence.
-- 3. Data repair: a recurring posting whose hash an older Worker rewrote on edit lost its occurrence. Give it its local date as
--    the occurrence when that does not clash with another live posting of the same item, so the occurrence index covers it.

DROP TRIGGER IF EXISTS transactions_kind_after_insert;
DROP TRIGGER IF EXISTS transactions_kind_after_type_update;
DROP TRIGGER IF EXISTS transactions_kind_before_update;
DROP TRIGGER IF EXISTS transactions_recurring_occurrence_after_insert;
DROP TRIGGER IF EXISTS recurring_items_starts_on_after_insert;
DROP INDEX IF EXISTS transactions_user_legacy_hash_uniq;

CREATE TRIGGER transactions_kind_check_insert BEFORE INSERT ON transactions
WHEN NOT ((NEW.kind = 'spend' AND NEW.type = 'debit') OR (NEW.kind IN ('income', 'payback') AND NEW.type = 'credit') OR NEW.kind = 'transfer')
BEGIN
  SELECT RAISE(ABORT, 'transaction kind does not match its direction');
END;

CREATE TRIGGER transactions_kind_check_update BEFORE UPDATE OF kind, type ON transactions
WHEN NOT ((NEW.kind = 'spend' AND NEW.type = 'debit') OR (NEW.kind IN ('income', 'payback') AND NEW.type = 'credit') OR NEW.kind = 'transfer')
BEGIN
  SELECT RAISE(ABORT, 'transaction kind does not match its direction');
END;

UPDATE transactions AS t
SET recurring_occurrence = t.local_date
WHERE t.recurring_item_id IS NOT NULL
  AND t.recurring_occurrence IS NULL
  AND t.local_date IS NOT NULL
  AND t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM transactions o
    WHERE o.user_id = t.user_id AND o.recurring_item_id = t.recurring_item_id AND o.recurring_occurrence = t.local_date
      AND o.deleted_at IS NULL AND o.id <> t.id
  );
