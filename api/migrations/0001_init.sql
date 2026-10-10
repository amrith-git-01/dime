-- Dime D1 schema (phase 1). Port of the Supabase Postgres tables the API uses.
--
-- Conventions:
--   ids          TEXT uuids, generated in the Worker (crypto.randomUUID()), lower-case
--   money        INTEGER cents (repositories convert with core/decimal.ts at the boundary)
--   timestamps   TEXT, ISO-8601 UTC with milliseconds and a Z suffix (new Date().toISOString()),
--                so plain text comparison orders them correctly
--   booleans     INTEGER 0/1
--   json         TEXT
--   updated_at   is set by the repositories on every write (no triggers: jobs rewinds it on purpose)

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  username    TEXT,
  currency    TEXT NOT NULL DEFAULT 'INR',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  avatar_url  TEXT,
  email       TEXT
);

CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon_name   TEXT,
  color       TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  user_id     TEXT REFERENCES users (id) ON DELETE CASCADE
);
-- Kept 1:1 with Postgres: category names are unique across ALL users (case-insensitive).
CREATE UNIQUE INDEX categories_name_uniq ON categories (lower(name));
CREATE UNIQUE INDEX categories_user_name_uniq ON categories (user_id, lower(name))
  WHERE is_system = 0 AND user_id IS NOT NULL;
CREATE INDEX categories_user_idx ON categories (user_id);

INSERT INTO categories (id, name, icon_name, color, is_system, created_at, user_id) VALUES
  ('ad296c59-42ec-49e5-b824-c011c5b1b28b', 'Bills & Utilities', 'Zap',             '#FBBF24', 1, '2026-06-11T17:30:06.824Z', NULL),
  ('e7d18795-d02a-4350-9553-5573cc45aa28', 'Education',         'GraduationCap',   '#F472B6', 1, '2026-06-11T17:30:06.824Z', NULL),
  ('9a4d0ec2-15af-4162-ae1e-bc2b738ca33b', 'Entertainment',     'Clapperboard',    '#FB923C', 1, '2026-06-11T17:30:06.824Z', NULL),
  ('85bf877a-f8b1-4b07-a9fb-5e8c809907ae', 'Food & Dining',     'UtensilsCrossed', '#FF6B6B', 1, '2026-06-11T17:30:06.824Z', NULL),
  ('a00eb2e0-48a8-47f1-98cb-3a30b8731501', 'Health',            'HeartPulse',      '#4ADE80', 1, '2026-06-11T17:30:06.824Z', NULL),
  ('2aedfd2c-7a2d-48e9-9b9c-8918dd4e9715', 'Income',            'TrendingUp',      '#34D399', 1, '2026-06-11T17:30:06.824Z', NULL),
  ('cec86c98-e09e-4a7a-afb0-05f66b17a94b', 'Other',             'Package',         '#94A3B8', 1, '2026-06-11T17:30:06.824Z', NULL),
  ('a50ff903-ea00-404a-a3a4-d99c96899de5', 'Shopping',          'ShoppingBag',     '#A855F7', 1, '2026-06-11T17:30:06.824Z', NULL),
  ('533e41b7-e8cf-42bc-95db-35b793b9f1f4', 'Transport',         'Car',             '#4ECDC4', 1, '2026-06-11T17:30:06.824Z', NULL),
  ('be46f4f5-efa9-4ad9-b09c-ca24a088e7f7', 'Travel',            'Plane',           '#818CF8', 1, '2026-06-11T17:30:06.824Z', NULL);

CREATE TABLE transactions (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount                  INTEGER NOT NULL CHECK (amount > 0),
  type                    TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
  note                    TEXT,
  detected_via            TEXT CHECK (detected_via IN ('manual', 'sms', 'voice', 'scan', 'notification')),
  transaction_at          TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at              TEXT,
  category_id             TEXT REFERENCES categories (id) ON DELETE SET NULL,
  receipt_url             TEXT,
  voice_url               TEXT,
  counterparty_name       TEXT,
  counterparty_type       TEXT DEFAULT 'merchant'
                          CHECK (counterparty_type IN ('merchant', 'person', 'self_transfer', 'unknown')),
  counterparty_normalized TEXT,
  payment_hash            TEXT,
  -- Computed on write (features/transactions/dedupe.ts payeeKey, same rule as Postgres agent_payee_key).
  payee_key               TEXT NOT NULL
);
CREATE INDEX transactions_user_at_idx ON transactions (user_id, transaction_at DESC);
CREATE INDEX transactions_user_updated_idx ON transactions (user_id, updated_at DESC);
CREATE INDEX transactions_user_active_idx ON transactions (user_id) WHERE deleted_at IS NULL;
CREATE INDEX transactions_category_idx ON transactions (category_id);
CREATE INDEX transactions_counterparty_normalized_idx ON transactions (counterparty_normalized);
CREATE INDEX transactions_user_payee_idx ON transactions (user_id, payee_key) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX transactions_user_payment_hash_uniq ON transactions (user_id, payment_hash)
  WHERE payment_hash IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE budgets (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  monthly_budget INTEGER NOT NULL CHECK (monthly_budget >= 0),
  daily_budget   INTEGER CHECK (daily_budget >= 0),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE category_budgets (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id    TEXT NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  monthly_amount INTEGER NOT NULL CHECK (monthly_amount > 0),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, category_id)
);

CREATE TABLE notifications (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL CHECK (kind IN ('transaction_auto', 'budget_threshold', 'capture_failed')),
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,
  action_type           TEXT CHECK (action_type IN ('transaction_detail', 'home', 'manual_add', 'none')),
  action_transaction_id TEXT REFERENCES transactions (id) ON DELETE SET NULL,
  dedupe_key            TEXT,
  read_at               TEXT,
  deleted_at            TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE user_settings (
  user_id                         TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  budget_alerts_enabled           INTEGER NOT NULL DEFAULT 1 CHECK (budget_alerts_enabled IN (0, 1)),
  auto_capture_alerts_enabled     INTEGER NOT NULL DEFAULT 1 CHECK (auto_capture_alerts_enabled IN (0, 1)),
  capture_failed_alerts_enabled   INTEGER NOT NULL DEFAULT 1 CHECK (capture_failed_alerts_enabled IN (0, 1)),
  created_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  budget_monthly_alerts_enabled   INTEGER NOT NULL DEFAULT 1 CHECK (budget_monthly_alerts_enabled IN (0, 1)),
  budget_daily_alerts_enabled     INTEGER NOT NULL DEFAULT 1 CHECK (budget_daily_alerts_enabled IN (0, 1)),
  budget_category_alerts_enabled  INTEGER NOT NULL DEFAULT 1 CHECK (budget_category_alerts_enabled IN (0, 1)),
  budget_monthly_warn_pct         INTEGER NOT NULL DEFAULT 80 CHECK (budget_monthly_warn_pct BETWEEN 50 AND 95),
  budget_daily_warn_pct           INTEGER NOT NULL DEFAULT 80 CHECK (budget_daily_warn_pct BETWEEN 50 AND 95),
  budget_category_warn_pct        INTEGER NOT NULL DEFAULT 80 CHECK (budget_category_warn_pct BETWEEN 50 AND 95),
  device_notifications_enabled    INTEGER NOT NULL DEFAULT 1 CHECK (device_notifications_enabled IN (0, 1)),
  daily_expense_reminder_enabled  INTEGER NOT NULL DEFAULT 1 CHECK (daily_expense_reminder_enabled IN (0, 1)),
  daily_expense_reminder_time     TEXT NOT NULL DEFAULT '20:00'
                                  CHECK (length(daily_expense_reminder_time) = 5
                                         AND daily_expense_reminder_time GLOB '[0-2][0-9]:[0-5][0-9]'
                                         AND substr(daily_expense_reminder_time, 1, 2) <= '23'),
  weekly_email_enabled            INTEGER NOT NULL DEFAULT 1 CHECK (weekly_email_enabled IN (0, 1)),
  monthly_email_enabled           INTEGER NOT NULL DEFAULT 1 CHECK (monthly_email_enabled IN (0, 1))
);

CREATE TABLE user_feedback (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message           TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  feedback_type     TEXT CHECK (feedback_type IN ('bug', 'idea', 'enhancement')),
  reporter_email    TEXT,
  reporter_username TEXT
);

CREATE TABLE user_push_tokens (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL UNIQUE,
  platform        TEXT NOT NULL DEFAULT 'android' CHECK (platform = 'android'),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX user_push_tokens_user_idx ON user_push_tokens (user_id);

CREATE TABLE email_sends (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('welcome', 'weekly', 'monthly')),
  period_key       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  sent_at          TEXT,
  brevo_message_id TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  claimed_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, kind, period_key)
);
CREATE INDEX email_sends_pending_claimed_idx ON email_sends (claimed_at) WHERE status = 'pending';

CREATE TABLE jobs (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  payload         TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  idempotency_key TEXT,
  result          TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX jobs_user_idempotency_uniq ON jobs (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX jobs_status_updated_idx ON jobs (status, updated_at);

CREATE TABLE agent_usage (
  user_id           TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day               TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  turns             INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, day)
);

CREATE TABLE agent_feedback (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  turn_id    TEXT NOT NULL,
  rating     TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  comment    TEXT CHECK (comment IS NULL OR length(comment) <= 1000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, turn_id)
);
