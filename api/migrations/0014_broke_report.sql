-- Broke Report: a monthly, story-style recap of the previous month (docs/BROKE-REPORT-PLAN.md).
--
-- 1. monthly_reports: the immutable snapshot of one finished IST month per user. The snapshot holds facts and ids only
--    (copy lives in the app); it is built lazily by GET /reports/:period or by the cron consumer, whichever comes first.
--    `version` is the snapshot shape: a stored row with an older version than the code is rebuilt in place.
--    `notified_at` is set once the report_ready notification step has finished for the row (also when the user has report
--    alerts off, which counts as handled); the catch-up fan-out re-selects rows where it is still NULL.
-- 2. user_settings: report_alerts_enabled (push + inbox when a report is ready) and report_roast_level (the tone of the
--    copy; the app reads it, the server only stores it). Defaults here equal DEFAULT_SETTINGS in user-settings/snapshot.ts.
-- 3. notifications: a CHECK cannot be altered in SQLite, so the table is rebuilt to allow kind 'report_ready' and
--    action_type 'report', and gains action_period_key ('YYYY-MM', set only for action_type 'report') so the app can open
--    the right report from the inbox or from a push. Nothing references notifications, so it is a plain copy-and-swap.

CREATE TABLE monthly_reports (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  period_key TEXT NOT NULL CHECK (period_key GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  version    INTEGER NOT NULL,
  snapshot   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  viewed_at  TEXT,
  notified_at TEXT,
  PRIMARY KEY (user_id, period_key)
);

ALTER TABLE user_settings ADD COLUMN report_alerts_enabled INTEGER NOT NULL DEFAULT 1 CHECK (report_alerts_enabled IN (0, 1));
ALTER TABLE user_settings ADD COLUMN report_roast_level TEXT NOT NULL DEFAULT 'spicy' CHECK (report_roast_level IN ('gentle', 'spicy', 'savage'));

CREATE TABLE notifications_new (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL CHECK (kind IN ('transaction_auto', 'budget_threshold', 'capture_failed', 'report_ready')),
  title                 TEXT NOT NULL,
  body                  TEXT NOT NULL,
  action_type           TEXT CHECK (action_type IN ('transaction_detail', 'home', 'manual_add', 'report', 'none')),
  action_transaction_id TEXT REFERENCES transactions (id) ON DELETE SET NULL,
  dedupe_key            TEXT,
  read_at               TEXT,
  deleted_at            TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  action_period_key     TEXT CHECK (action_period_key IS NULL OR action_period_key GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  UNIQUE (user_id, dedupe_key)
);

INSERT INTO notifications_new (id, user_id, kind, title, body, action_type, action_transaction_id, dedupe_key, read_at, deleted_at, created_at)
SELECT id, user_id, kind, title, body, action_type, action_transaction_id, dedupe_key, read_at, deleted_at, created_at FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC) WHERE deleted_at IS NULL;
