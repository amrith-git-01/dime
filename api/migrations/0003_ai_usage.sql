-- Workers AI cost cap (phase 4). Workers AI gives 10,000 neurons/day free per ACCOUNT and bills above that,
-- so the app stops before it: uploads and the queue consumer read these counters (features/ai/neuron-cap.ts).
--   ai_usage       one GLOBAL row per UTC day: neurons spent on voice + receipt OCR (DeepSeek calls are not counted)
--   ai_user_usage  per user and UTC day: captures (receipt + voice uploads) accepted, for the per-user daily limit

CREATE TABLE ai_usage (
  day        TEXT PRIMARY KEY,
  neurons    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE ai_user_usage (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  captures   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, day)
);
