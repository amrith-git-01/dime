-- Recurring income (salary) and subscriptions. The Worker's 5-minute cron posts a normal transaction when an item is due
-- (features/recurring/poster.ts), then advances next_due_date by one period.
--   day_of_month    requested day (1-31); months that are shorter clamp to their last day, the requested day is kept
--   month_of_year   1-12 for yearly items, NULL for monthly ones
--   next_due_date   local calendar date (YYYY-MM-DD in `timezone`) of the next posting, due at 06:00 local
CREATE TABLE recurring_items (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('income', 'subscription')),
  name          TEXT NOT NULL,
  amount        INTEGER NOT NULL CHECK (amount > 0),
  category_id   TEXT REFERENCES categories (id) ON DELETE SET NULL,
  cadence       TEXT NOT NULL CHECK (cadence IN ('monthly', 'yearly')),
  day_of_month  INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  month_of_year INTEGER CHECK (month_of_year BETWEEN 1 AND 12),
  timezone      TEXT NOT NULL,
  next_due_date TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((cadence = 'yearly') = (month_of_year IS NOT NULL))
);
CREATE INDEX recurring_items_user_idx ON recurring_items (user_id);
CREATE INDEX recurring_items_due_idx ON recurring_items (active, next_due_date);

-- Which recurring item produced a transaction (NULL for everything else). Deleting the item keeps its transactions.
ALTER TABLE transactions ADD COLUMN recurring_item_id TEXT REFERENCES recurring_items (id) ON DELETE SET NULL;
CREATE INDEX transactions_recurring_idx ON transactions (recurring_item_id, transaction_at) WHERE recurring_item_id IS NOT NULL;
