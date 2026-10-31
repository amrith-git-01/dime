-- Reminders: money to pay or to receive, one-off or repeating (docs/REMINDERS-PLAN.md).
--
-- 1. reminders: one row per reminder. `due_date` is a LOCAL calendar date in the reminder's own `timezone`; amounts are
--    integer cents. `lead_days` / `remind_time` NULL mean "use the user's defaults" (user_settings, below). The cron
--    (features/reminders/sender.ts) fires `next_fire_at` (UTC ISO, NULL = nothing left to send) and records the last
--    instant it sent in `fired_through`. `anchor_day` is the requested day of month (clamped when a month is shorter, like
--    recurring_items.day_of_month). `completed_txn_id` is the transaction the user marked it paid with, if any; `used_txn_ids`
--    keeps the latest few of them (a repeating reminder is completed again and again) so "looks paid" never suggests them again.
-- 2. recurring_items: opt-in lead-day reminders. `remind_lead_days` is a JSON int array (NULL = off); `next_remind_at` is the
--    next instant to send one (kept in step with next_due_date / remind_lead_days by the service, the cron and the poster).
-- 3. user_settings: the reminder preferences (defaults here equal DEFAULT_SETTINGS in user-settings/snapshot.ts) and the
--    user's own UPI id (NULL = none) and IANA timezone (written by the app; NULL until it has).
-- 4. notifications: a CHECK cannot be altered in SQLite, so the table is rebuilt (copy-and-swap, like 0014) to allow kind
--    'reminder_due' and action_type 'reminder', and gains action_reminder_id so the app can open the reminder. `reminders`
--    is created first because the new column references it. Nothing references notifications.

CREATE TABLE reminders (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  direction         TEXT NOT NULL CHECK (direction IN ('pay', 'receive')),
  title             TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  amount            INTEGER CHECK (amount IS NULL OR amount > 0),
  counterparty_name TEXT,
  payee_key         TEXT,
  upi_id            TEXT,
  due_date          TEXT NOT NULL CHECK (due_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  cadence           TEXT NOT NULL DEFAULT 'none' CHECK (cadence IN ('none', 'weekly', 'monthly', 'yearly')),
  anchor_day        INTEGER NOT NULL CHECK (anchor_day BETWEEN 1 AND 31),
  lead_days         TEXT CHECK (lead_days IS NULL OR (json_valid(lead_days) AND json_type(lead_days) = 'array')),
  remind_time       TEXT CHECK (remind_time IS NULL OR (length(remind_time) = 5 AND remind_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(remind_time, 1, 2) <= '23')),
  timezone          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  completed_at      TEXT,
  completed_txn_id  TEXT REFERENCES transactions (id) ON DELETE SET NULL,
  used_txn_ids      TEXT CHECK (used_txn_ids IS NULL OR (json_valid(used_txn_ids) AND json_type(used_txn_ids) = 'array')),
  fired_through     TEXT,
  next_fire_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX reminders_fire_idx ON reminders (next_fire_at) WHERE status = 'open' AND next_fire_at IS NOT NULL;
CREATE INDEX reminders_user_idx ON reminders (user_id, status, due_date);

ALTER TABLE recurring_items ADD COLUMN remind_lead_days TEXT CHECK (remind_lead_days IS NULL OR (json_valid(remind_lead_days) AND json_type(remind_lead_days) = 'array'));
ALTER TABLE recurring_items ADD COLUMN next_remind_at TEXT;
CREATE INDEX recurring_items_remind_idx ON recurring_items (next_remind_at) WHERE next_remind_at IS NOT NULL;

ALTER TABLE user_settings ADD COLUMN reminders_enabled INTEGER NOT NULL DEFAULT 1 CHECK (reminders_enabled IN (0, 1));
ALTER TABLE user_settings ADD COLUMN reminder_default_lead_days TEXT NOT NULL DEFAULT '[3,1,0]' CHECK (json_valid(reminder_default_lead_days) AND json_type(reminder_default_lead_days) = 'array');
ALTER TABLE user_settings ADD COLUMN reminder_time TEXT NOT NULL DEFAULT '09:00'
  CHECK (length(reminder_time) = 5 AND reminder_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(reminder_time, 1, 2) <= '23');
ALTER TABLE user_settings ADD COLUMN reminder_overdue_nudges INTEGER NOT NULL DEFAULT 2 CHECK (reminder_overdue_nudges BETWEEN 0 AND 5);
ALTER TABLE user_settings ADD COLUMN reminder_quiet_enabled INTEGER NOT NULL DEFAULT 0 CHECK (reminder_quiet_enabled IN (0, 1));
ALTER TABLE user_settings ADD COLUMN reminder_quiet_start TEXT NOT NULL DEFAULT '22:00'
  CHECK (length(reminder_quiet_start) = 5 AND reminder_quiet_start GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(reminder_quiet_start, 1, 2) <= '23');
ALTER TABLE user_settings ADD COLUMN reminder_quiet_end TEXT NOT NULL DEFAULT '08:00'
  CHECK (length(reminder_quiet_end) = 5 AND reminder_quiet_end GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(reminder_quiet_end, 1, 2) <= '23');
ALTER TABLE user_settings ADD COLUMN reminder_hide_amounts INTEGER NOT NULL DEFAULT 0 CHECK (reminder_hide_amounts IN (0, 1));
ALTER TABLE user_settings ADD COLUMN upi_id TEXT;
ALTER TABLE user_settings ADD COLUMN timezone TEXT;

CREATE TABLE notifications_new (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL CHECK (kind IN ('transaction_auto', 'budget_threshold', 'capture_failed', 'report_ready', 'reminder_due')),
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,
  action_type           TEXT CHECK (action_type IN ('transaction_detail', 'home', 'manual_add', 'report', 'reminder', 'none')),
  action_transaction_id TEXT REFERENCES transactions (id) ON DELETE SET NULL,
  dedupe_key            TEXT,
  read_at               TEXT,
  deleted_at            TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  action_period_key     TEXT CHECK (action_period_key IS NULL OR action_period_key GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  action_reminder_id    TEXT REFERENCES reminders (id) ON DELETE SET NULL,
  UNIQUE (user_id, dedupe_key)
);

INSERT INTO notifications_new (id, user_id, kind, title, body, action_type, action_transaction_id, dedupe_key, read_at, deleted_at, created_at, action_period_key)
SELECT id, user_id, kind, title, body, action_type, action_transaction_id, dedupe_key, read_at, deleted_at, created_at, action_period_key FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC) WHERE deleted_at IS NULL;
