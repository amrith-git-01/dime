-- B8 / C2: durable background jobs + idempotency records.
--
-- * kind: 'receipt' | 'voice' | 'sms' (queued work) and 'manual_create' (idempotency record only).
-- * payload never holds media bytes: receipts/voice are uploaded to the private bucket first and
--   the payload stores the object path.
-- * Service role only: RLS is enabled with no client policies.

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  idempotency_key text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists jobs_user_idempotency_key_uidx
  on public.jobs (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists jobs_status_updated_idx
  on public.jobs (status, updated_at);

alter table public.jobs enable row level security;
-- Intentionally no policies: only the service role (which bypasses RLS) may touch this table.
