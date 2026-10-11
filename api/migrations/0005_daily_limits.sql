-- Per-kind daily limits (features/ai/neuron-cap.ts). Receipt scans and voice captures were one combined
-- `captures` counter; they now have their own counters so each kind has its own limit (AI_USER_DAILY_RECEIPTS,
-- AI_USER_DAILY_VOICE). `captures` stays (SQLite cannot cheaply drop it) but nothing reads or writes it any more.
ALTER TABLE ai_user_usage ADD COLUMN receipts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_user_usage ADD COLUMN voices   INTEGER NOT NULL DEFAULT 0;
