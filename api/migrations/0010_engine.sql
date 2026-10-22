-- Predictive engine (docs/PREDICTIVE-ENGINE-PLAN.md §4). Per-user spending patterns are rebuilt nightly on the
-- `dime-engine` queue (features/engine/job.ts); the forecast itself is computed per request from these rows.
-- Money is integer paise, timestamps are `toISOString()` text, JSON is text.

-- One profile row per user. `dirty` is set on any transaction write (features/engine/dirty.ts); a row with version 0
-- and an empty profile is just that mark, made before the first job ran.
--   dirty_seq  bumped by every mark, so a job that started before a mark can tell it must not clear `dirty`
--   timezone   explicit override (set by the forecast route from the app); NULL = recurring items' timezone, else Asia/Kolkata
--   timezone_at  when `timezone` was last changed (the route keeps a new one out for 6 hours, so a user switching between zones does not rebuild the profile on every request)
-- The DeepSeek labeller (features/engine/labeller.ts) keeps its per-user results here, apart from `profile` because a rebuild replaces that:
--   copy          JSON: the sentence templates it wrote (summary + one per watch item), with {placeholders} that code fills
--   copy_day      the user's local day (YYYY-MM-DD) the templates were written for; they are used only on that day
--   payee_merges  JSON map alias payee_key -> canonical payee_key (applied when transactions are loaded)
--   merge_rejects JSON array of "a|b" payee_key pairs the model said are different payees (not asked again)
-- Self-scoring (features/engine/scoring.ts) tunes these two per user; a nightly rebuild reads them and never overwrites them:
--   width_factor  multiplier on the forecast range (more when the actuals fell outside p10-p90 too often)
--   window_days   baseline window in days (60, 90 or 120), the one that replayed best on the last scored month
--   last_tuned_month  the latest finished month (YYYY-MM) the tuning has looked at, so a night that failed halfway tunes again
CREATE TABLE engine_patterns (
  user_id       TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  history_days  INTEGER NOT NULL,
  profile       TEXT NOT NULL,
  dirty         INTEGER NOT NULL DEFAULT 0,
  dirty_seq     INTEGER NOT NULL DEFAULT 0,
  computed_at   TEXT NOT NULL,
  timezone      TEXT,
  timezone_at   TEXT,
  copy          TEXT,
  copy_day      TEXT,
  payee_merges  TEXT,
  merge_rejects TEXT,
  width_factor  REAL NOT NULL DEFAULT 1,
  window_days   INTEGER NOT NULL DEFAULT 90,
  last_tuned_month TEXT
);

-- One row per user + payee with enough repeats to have a cadence. `kind_source` says who decided `kind`: the nightly
-- rule, the labeller ('llm', asked once per subscription candidate) or the user; a rebuild keeps an 'llm' or 'user'
-- choice between habit and subscription. `last_scored_expected_at` is the `next_expected_at` the implicit hit/miss score
-- (features/engine/confidence.ts) last judged, so an expectation is scored once; NULL = never scored.
CREATE TABLE payee_patterns (
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  payee_key        TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('habit', 'subscription', 'income', 'unknown')),
  kind_source      TEXT NOT NULL DEFAULT 'rule' CHECK (kind_source IN ('rule', 'llm', 'user')),
  category_id      TEXT,
  count_120d       INTEGER NOT NULL,
  median_amount    INTEGER NOT NULL,
  median_interval_days REAL,
  interval_cv      REAL,
  last_at          TEXT NOT NULL,
  next_expected_at TEXT,
  alpha            REAL NOT NULL DEFAULT 1,
  beta             REAL NOT NULL DEFAULT 1,
  suppressed       INTEGER NOT NULL DEFAULT 0,
  last_scored_expected_at TEXT,
  PRIMARY KEY (user_id, payee_key)
);

-- LLM labels per transaction (one-off vs habit). Computed once, cached forever.
CREATE TABLE txn_labels (
  transaction_id TEXT PRIMARY KEY REFERENCES transactions (id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL,
  one_off        INTEGER NOT NULL CHECK (one_off IN (0, 1)),
  source         TEXT NOT NULL CHECK (source IN ('llm', 'rule', 'user')),
  labelled_at    TEXT NOT NULL
);
CREATE INDEX txn_labels_user_idx ON txn_labels (user_id);

-- What the user told us about a prediction (features/engine/feedback.ts): the latest answer per target, so a replayed
-- request cannot count twice. `month` (YYYY-MM, the user's local month) scopes a category_watch dismissal to that month;
-- the other kinds leave it ''.
CREATE TABLE prediction_feedback (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_kind  TEXT NOT NULL CHECK (target_kind IN ('payee', 'subscription_candidate', 'unusual_txn', 'category_watch', 'payee_merge')),
  target_id    TEXT NOT NULL,
  verdict      TEXT NOT NULL CHECK (verdict IN ('confirm', 'dismiss', 'not_one_off', 'one_off')),
  month        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);
CREATE INDEX prediction_feedback_user_idx ON prediction_feedback (user_id, created_at DESC);
CREATE UNIQUE INDEX prediction_feedback_target_idx ON prediction_feedback (user_id, target_kind, target_id, month);

-- Forecasts as they were made, for self-scoring. `actual` is filled at month end. `width_factor` and `window_days` are the
-- user's tuning when the snapshot was made: the width is only judged on snapshots that were made with it.
CREATE TABLE forecast_snapshots (
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  month       TEXT NOT NULL,
  day         INTEGER NOT NULL,
  method      TEXT NOT NULL,
  p10 INTEGER NOT NULL, p50 INTEGER NOT NULL, p90 INTEGER NOT NULL,
  width_factor REAL NOT NULL DEFAULT 1,
  window_days  INTEGER NOT NULL DEFAULT 90,
  actual      INTEGER,
  PRIMARY KEY (user_id, month, day, method)
);
