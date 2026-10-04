-- Transactional email: digest toggles, send log, optional email on public.users.

alter table public.users
  add column if not exists email text;

alter table public.user_settings
  add column if not exists weekly_email_enabled boolean not null default true;

alter table public.user_settings
  add column if not exists monthly_email_enabled boolean not null default true;

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('welcome', 'weekly', 'monthly')),
  period_key text not null,
  status text not null check (status in ('pending', 'sent')),
  sent_at timestamptz,
  brevo_message_id text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, period_key)
);

create index if not exists email_sends_user_kind_idx
  on public.email_sends (user_id, kind);

alter table public.email_sends enable row level security;
