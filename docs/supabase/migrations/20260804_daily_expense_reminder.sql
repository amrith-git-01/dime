-- daily expense reminder (2026-08-04)

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS daily_expense_reminder_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_expense_reminder_time text NOT NULL DEFAULT '20:00';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_daily_expense_reminder_time_check'
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_daily_expense_reminder_time_check
      CHECK (daily_expense_reminder_time ~ '^(?:[01]\d|2[0-3]):[0-5]\d$');
  END IF;
END $$;
