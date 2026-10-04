-- R2: SQL-side aggregation for the transactions endpoints (home, month insights, list day summaries).
--
-- Python paged every row of a period (amount, type, transaction_at / payee fields) through the API and
-- bucketed it in application code. These two functions return one small row per local day / per payee
-- instead, so a month of data is a handful of rows over the wire.
--
-- Both are called by the API with the service role, so the caller's user id is passed explicitly
-- (p_user_id) and every statement filters by it. SECURITY INVOKER keeps RLS in force for any non-service
-- caller; EXECUTE is revoked from anon/authenticated so clients cannot call them with someone else's id.
--
-- The API treats a missing / failing function as "not deployed yet" and falls back to the previous
-- row-paging aggregation, so this migration and the API can be rolled out in either order.
--
-- Assumed schema (as used by the Python backend): public.transactions(user_id, type 'debit'|'credit',
-- amount numeric, transaction_at timestamptz, deleted_at timestamptz, counterparty_name text,
-- counterparty_normalized text).
--
-- All ranges are half-open: p_from <= transaction_at < p_to.

-- transactions_daily_totals: per local calendar day (in p_tz, an IANA name such as 'Asia/Kolkata')
-- credit/debit totals and counts. Days without credit/debit rows are omitted (the API fills zero days).
create or replace function public.transactions_daily_totals(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text
)
returns table (
  day date,
  credit_total numeric,
  debit_total numeric,
  credit_count bigint,
  debit_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (t.transaction_at at time zone p_tz)::date,
    coalesce(sum(t.amount) filter (where t.type::text = 'credit'), 0),
    coalesce(sum(t.amount) filter (where t.type::text = 'debit'), 0),
    count(*) filter (where t.type::text = 'credit'),
    count(*) filter (where t.type::text = 'debit')
  from public.transactions t
  where t.user_id = p_user_id
    and t.deleted_at is null
    and t.type::text in ('credit', 'debit')
    and t.transaction_at >= p_from
    and t.transaction_at < p_to
  group by 1
  order by 1
$$;

revoke all on function public.transactions_daily_totals(uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.transactions_daily_totals(uuid, timestamptz, timestamptz, text)
  to service_role;

-- transactions_payee_totals: per (type, payee) totals and counts for debit and credit rows.
--   payee_key     counterparty_normalized when non-empty, else the counterparty name normalized the same
--                 way as the app (lower-case, runs of non [a-z0-9] -> one space, trimmed), else 'unknown'.
--   display_name  the name of the OLDEST row in the group that has a non-empty name ('Unknown' if none),
--                 matching the previous behaviour of the Python rollup.
-- Ordered by type, then total descending (ties: most recent transaction first).
create or replace function public.transactions_payee_totals(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  type text,
  payee_key text,
  display_name text,
  total numeric,
  transaction_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with src as (
    select
      t.type::text as tx_type,
      coalesce(
        nullif(btrim(t.counterparty_normalized), ''),
        nullif(btrim(regexp_replace(lower(btrim(coalesce(t.counterparty_name, ''))), '[^a-z0-9]+', ' ', 'g')), ''),
        'unknown'
      ) as pkey,
      nullif(btrim(t.counterparty_name), '') as pname,
      t.amount,
      t.transaction_at
    from public.transactions t
    where t.user_id = p_user_id
      and t.deleted_at is null
      and t.type::text in ('debit', 'credit')
      and t.transaction_at >= p_from
      and t.transaction_at < p_to
  )
  select
    s.tx_type,
    s.pkey,
    coalesce((array_agg(s.pname order by s.transaction_at asc) filter (where s.pname is not null))[1], 'Unknown'),
    sum(s.amount),
    count(*)
  from src s
  group by s.tx_type, s.pkey
  order by s.tx_type, sum(s.amount) desc, max(s.transaction_at) desc, s.pkey
$$;

revoke all on function public.transactions_payee_totals(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.transactions_payee_totals(uuid, timestamptz, timestamptz)
  to service_role;
