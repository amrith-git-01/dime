-- device notifications flag + Expo push tokens (2026-07-18)

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS device_notifications_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_push_tokens_expo_push_token_key UNIQUE (expo_push_token),
  CONSTRAINT user_push_tokens_platform_check CHECK (platform IN ('android'))
);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_id_idx
  ON public.user_push_tokens (user_id);

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;
