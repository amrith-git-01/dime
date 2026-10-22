-- Daily token budget of the engine's DeepSeek labeller (features/engine/labeller.ts), one GLOBAL row per UTC day like
-- `ai_usage`: prompt + completion tokens spent. A call claims its estimate up front (an atomic upsert-with-WHERE below
-- ENGINE_DAILY_TOKEN_BUDGET) and settles to the real usage afterwards.

CREATE TABLE engine_usage (
  day        TEXT PRIMARY KEY,
  tokens     INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
