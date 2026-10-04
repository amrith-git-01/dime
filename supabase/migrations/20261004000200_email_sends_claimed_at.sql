-- B3: lets the API reclaim email sends stuck in 'pending' (process died between claim and send).
-- try_begin() treats only a unique violation as "already claimed" and re-claims a pending row
-- whose claimed_at is older than 30 minutes.

alter table public.email_sends
  add column if not exists claimed_at timestamptz not null default now();

create index if not exists email_sends_pending_claimed_idx
  on public.email_sends (claimed_at)
  where status = 'pending';
