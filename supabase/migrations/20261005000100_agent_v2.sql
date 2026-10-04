-- Dime Agent v2: tool functions, fuzzy entity search, usage budget and feedback.
--
-- The agent (api/src/features/agent) is a bounded tool-calling loop. Its data tools are the
-- `agent_*` functions below. The API runs them as role `authenticated` inside ONE read-only
-- transaction per agent step, after `set_config('request.jwt.claims', {sub, role, aud}, true)`,
-- `set local role authenticated` and `set local statement_timeout`. So:
--
--   * every function is SECURITY INVOKER: row level security of the caller applies;
--   * every function also filters by `(select auth.uid())` explicitly (defence in depth, and the
--     planner can use user_id indexes);
--   * EXECUTE is granted to `authenticated` only (revoked from public / anon / service_role): the
--     functions take no user id, so nobody can ask for another user's data;
--   * all functions are STABLE, return one compact jsonb document (aggregates, top-N, counts;
--     never raw dumps and never `transactions.note`) and use HALF-OPEN ranges: p_from <= at < p_to.
--
-- Assumed schema (as used by the API and the earlier migrations):
--   transactions(id, user_id, amount numeric, type 'debit'|'credit', counterparty_name,
--                counterparty_normalized, category_id, transaction_at timestamptz, deleted_at)
--   categories(id, user_id nullable, name, is_system)
--   budgets(user_id, monthly_budget, daily_budget)
--   category_budgets(user_id, category_id, monthly_amount)
--   auth.uid() (Supabase). Budgets are calendar months in the caller's timezone: the API passes the
--   month as [p_from, p_to).
--
-- Payee keys use the same rule as `transactions_payee_totals` (counterparty_normalized, else the
-- normalized name, else 'unknown'); see agent_payee_key.
--
-- pg_trgm: Supabase ships the extension; it is created in schema `extensions`. The functions set
-- `search_path = public, extensions`, so they work wherever the extension lives. The GIN index uses a
-- DO block with a local search_path for the same reason. CREATE INDEX (not CONCURRENTLY: migrations run
-- in a transaction) takes a short write lock on `transactions`; run it at low traffic.
--
-- Safe to re-run: everything is `if not exists` / `create or replace` / drop-then-create for policies.

create extension if not exists pg_trgm with schema extensions;

do $$
begin
  perform set_config('search_path', 'public, extensions', true);
  execute 'create index if not exists transactions_counterparty_name_trgm_idx
             on public.transactions using gin (counterparty_name gin_trgm_ops)
             where deleted_at is null';
  execute 'create index if not exists categories_name_trgm_idx
             on public.categories using gin (name gin_trgm_ops)';
end
$$;

-- Payee key: counterparty_normalized when non-empty, else the name normalized the way the app does
-- it (lower-case, runs of non [a-z0-9] -> one space, trimmed), else 'unknown'.
create or replace function public.agent_payee_key(p_normalized text, p_name text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(
    nullif(btrim(p_normalized), ''),
    nullif(btrim(regexp_replace(lower(btrim(coalesce(p_name, ''))), '[^a-z0-9]+', ' ', 'g')), ''),
    'unknown'
  )
$$;

-- resolve_entities: fuzzy payee / category lookup for each phrase (at most 8 distinct phrases).
-- Per phrase the 3 best payees and 3 best categories, scored with pg_trgm:
--   score       word_similarity(phrase, name): how well the phrase appears as a word run inside the name
--   similarity  similarity(phrase, name): how close the whole strings are (1 = same name)
-- The `<%` operator uses the GIN indexes; its threshold is lowered to 0.4 for this function so typos
-- ("swigy") survive, callers decide what score is good enough.
create or replace function public.agent_resolve_entities(p_phrases text[])
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = '0.4'
as $$
  with phrases as (
    select distinct lower(btrim(x)) as phrase
    from unnest(coalesce(p_phrases, '{}'::text[])) as x
    where length(btrim(x)) >= 2
    limit 8
  ),
  payee_hits as (
    select ph.phrase, m.id, m.name, m.ws, m.sim, m.n
    from phrases ph
    cross join lateral (
      select
        public.agent_payee_key(t.counterparty_normalized, t.counterparty_name) as id,
        mode() within group (order by t.counterparty_name) as name,
        max(word_similarity(ph.phrase, t.counterparty_name)) as ws,
        max(similarity(ph.phrase, t.counterparty_name)) as sim,
        count(*) as n
      from public.transactions t
      where t.user_id = (select auth.uid())
        and t.deleted_at is null
        and ph.phrase <% t.counterparty_name
      group by 1
      order by 3 desc, 4 desc, 5 desc, 1
      limit 3
    ) m
  ),
  category_hits as (
    select ph.phrase, m.id, m.name, m.ws, m.sim, m.n
    from phrases ph
    cross join lateral (
      select
        c.id::text as id,
        c.name as name,
        word_similarity(ph.phrase, c.name) as ws,
        similarity(ph.phrase, c.name) as sim,
        0::bigint as n
      from public.categories c
      where (c.is_system or c.user_id = (select auth.uid()))
        and ph.phrase <% c.name
      order by 3 desc, 4 desc, 2
      limit 3
    ) m
  ),
  hits as (
    select 'payee'::text as type, phrase, id, name, ws, sim, n from payee_hits
    union all
    select 'category'::text, phrase, id, name, ws, sim, n from category_hits
  )
  select jsonb_build_object(
    'matches',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'phrase', phrase,
          'type', type,
          'id', id,
          'name', name,
          'score', round(ws::numeric, 3),
          'similarity', round(sim::numeric, 3),
          'txn_count', n
        )
        order by ws desc, sim desc, type, id
      ),
      '[]'::jsonb
    )
  )
  from hits
$$;

-- spending_summary: debit / credit totals, net (credit - debit) and counts, optionally for one
-- category and / or one payee key.
create or replace function public.agent_spending_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_category_id uuid default null,
  p_payee_key text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'debit', coalesce(sum(t.amount) filter (where t.type::text = 'debit'), 0),
    'credit', coalesce(sum(t.amount) filter (where t.type::text = 'credit'), 0),
    'net', coalesce(sum(case t.type::text when 'credit' then t.amount else -t.amount end), 0),
    'debit_count', count(*) filter (where t.type::text = 'debit'),
    'credit_count', count(*) filter (where t.type::text = 'credit'),
    'count', count(*)
  )
  from public.transactions t
  where t.user_id = (select auth.uid())
    and t.deleted_at is null
    and t.type::text in ('debit', 'credit')
    and t.transaction_at >= p_from
    and t.transaction_at < p_to
    and (p_category_id is null or t.category_id = p_category_id)
    and (p_payee_key is null or public.agent_payee_key(t.counterparty_normalized, t.counterparty_name) = p_payee_key)
$$;

-- category_breakdown: totals per category for one type ('debit' default), top 8 by total plus one
-- "other" bucket for the rest. `share` is a percentage with one decimal. Uncategorized rows have no
-- category_id and the name 'Uncategorized'.
create or replace function public.agent_category_breakdown(
  p_from timestamptz,
  p_to timestamptz,
  p_type text default 'debit'
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with src as (
    select t.category_id, sum(t.amount) as total, count(*) as n
    from public.transactions t
    where t.user_id = (select auth.uid())
      and t.deleted_at is null
      and t.type::text = case when p_type = 'credit' then 'credit' else 'debit' end
      and t.transaction_at >= p_from
      and t.transaction_at < p_to
    group by t.category_id
  ),
  named as (
    select
      s.category_id,
      coalesce(c.name, 'Uncategorized') as name,
      s.total,
      s.n,
      row_number() over (order by s.total desc, s.n desc, coalesce(c.name, '')) as rn
    from src s
    left join public.categories c on c.id = s.category_id
  ),
  grand as (
    select coalesce(sum(total), 0) as g, coalesce(sum(n), 0) as n from named
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'type', case when p_type = 'credit' then 'credit' else 'debit' end,
    'total', (select g from grand),
    'count', (select n from grand),
    'categories', coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'category_id', nm.category_id,
           'name', nm.name,
           'total', nm.total,
           'count', nm.n,
           'share', case when g.g > 0 then round(nm.total * 100 / g.g, 1) else 0 end
         ) order by nm.rn)
       from named nm cross join grand g
       where nm.rn <= 8),
      '[]'::jsonb),
    'other', (
      select case when count(*) > 0 then jsonb_build_object(
        'categories', count(*),
        'total', sum(nm.total),
        'count', sum(nm.n),
        'share', case when (select g from grand) > 0 then round(sum(nm.total) * 100 / (select g from grand), 1) else 0 end
      ) end
      from named nm where nm.rn > 8
    )
  ))
$$;

-- top_payees: debit totals per payee (top p_limit, at most 10), optionally inside one category.
-- Display name = the name of the OLDEST row with a non-empty name, like transactions_payee_totals.
create or replace function public.agent_top_payees(
  p_from timestamptz,
  p_to timestamptz,
  p_category_id uuid default null,
  p_limit integer default 5
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with src as (
    select
      public.agent_payee_key(t.counterparty_normalized, t.counterparty_name) as pkey,
      nullif(btrim(t.counterparty_name), '') as pname,
      t.amount,
      t.transaction_at
    from public.transactions t
    where t.user_id = (select auth.uid())
      and t.deleted_at is null
      and t.type::text = 'debit'
      and t.transaction_at >= p_from
      and t.transaction_at < p_to
      and (p_category_id is null or t.category_id = p_category_id)
  ),
  grouped as (
    select
      pkey,
      coalesce((array_agg(pname order by transaction_at asc) filter (where pname is not null))[1], 'Unknown') as name,
      sum(amount) as total,
      count(*) as n
    from src
    group by pkey
  ),
  ranked as (
    select g.*, row_number() over (order by g.total desc, g.n desc, g.pkey) as rn from grouped g
  ),
  grand as (
    select coalesce(sum(total), 0) as g, count(*) as payees from grouped
  )
  select jsonb_build_object(
    'total', (select g from grand),
    'payee_count', (select payees from grand),
    'payees', coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'payee_key', r.pkey,
           'name', r.name,
           'total', r.total,
           'count', r.n,
           'share', case when g.g > 0 then round(r.total * 100 / g.g, 1) else 0 end
         ) order by r.rn)
       from ranked r cross join grand g
       where r.rn <= least(greatest(coalesce(p_limit, 5), 1), 10)),
      '[]'::jsonb)
  )
$$;

-- daily_cashflow: per LOCAL day (p_tz) debit / credit totals for days that have transactions (the API
-- fills empty days when it draws a chart), plus range totals and the biggest spending day. Same bucketing
-- as transactions_daily_totals. The API limits the range to 40 days.
create or replace function public.agent_daily_cashflow(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with d as (
    select
      (t.transaction_at at time zone p_tz)::date as day,
      coalesce(sum(t.amount) filter (where t.type::text = 'debit'), 0) as debit,
      coalesce(sum(t.amount) filter (where t.type::text = 'credit'), 0) as credit
    from public.transactions t
    where t.user_id = (select auth.uid())
      and t.deleted_at is null
      and t.type::text in ('debit', 'credit')
      and t.transaction_at >= p_from
      and t.transaction_at < p_to
    group by 1
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'debit_total', coalesce((select sum(debit) from d), 0),
    'credit_total', coalesce((select sum(credit) from d), 0),
    'active_days', (select count(*) from d),
    'peak_debit_day', (
      select jsonb_build_object('date', day, 'debit', debit) from d where debit > 0 order by debit desc, day limit 1
    ),
    'days', coalesce(
      (select jsonb_agg(jsonb_build_object('date', day, 'debit', debit, 'credit', credit) order by day) from d),
      '[]'::jsonb)
  ))
$$;

-- compare_periods: two half-open periods A and B.
--   p_by = 'total'    -> totals only
--   p_by = 'category' -> + per-category debit rows (top 8 by max(a, b), rest in "other")
--   p_by = 'payee'    -> + per-payee debit rows (same shape)
-- delta = a - b, delta_pct = (a - b) * 100 / b (one decimal, absent when b is 0).
create or replace function public.agent_compare_periods(
  p_a_from timestamptz,
  p_a_to timestamptz,
  p_b_from timestamptz,
  p_b_to timestamptz,
  p_by text default 'total'
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      t.type::text as typ,
      t.amount,
      t.category_id,
      public.agent_payee_key(t.counterparty_normalized, t.counterparty_name) as pkey,
      nullif(btrim(t.counterparty_name), '') as pname,
      t.transaction_at,
      (t.transaction_at >= p_a_from and t.transaction_at < p_a_to) as in_a,
      (t.transaction_at >= p_b_from and t.transaction_at < p_b_to) as in_b
    from public.transactions t
    where t.user_id = (select auth.uid())
      and t.deleted_at is null
      and t.type::text in ('debit', 'credit')
      and (
        (t.transaction_at >= p_a_from and t.transaction_at < p_a_to)
        or (t.transaction_at >= p_b_from and t.transaction_at < p_b_to)
      )
  ),
  tot as (
    select
      coalesce(sum(amount) filter (where in_a and typ = 'debit'), 0) as a_debit,
      coalesce(sum(amount) filter (where in_a and typ = 'credit'), 0) as a_credit,
      count(*) filter (where in_a) as a_count,
      coalesce(sum(amount) filter (where in_b and typ = 'debit'), 0) as b_debit,
      coalesce(sum(amount) filter (where in_b and typ = 'credit'), 0) as b_credit,
      count(*) filter (where in_b) as b_count
    from base
  ),
  cat as (
    select
      b.category_id::text as id,
      coalesce(c.name, 'Uncategorized') as name,
      coalesce(sum(b.amount) filter (where b.in_a), 0) as a,
      coalesce(sum(b.amount) filter (where b.in_b), 0) as b
    from base b
    left join public.categories c on c.id = b.category_id
    where p_by = 'category' and b.typ = 'debit'
    group by b.category_id, c.name
  ),
  pay as (
    select
      b.pkey as id,
      coalesce((array_agg(b.pname order by b.transaction_at asc) filter (where b.pname is not null))[1], 'Unknown') as name,
      coalesce(sum(b.amount) filter (where b.in_a), 0) as a,
      coalesce(sum(b.amount) filter (where b.in_b), 0) as b
    from base b
    where p_by = 'payee' and b.typ = 'debit'
    group by b.pkey
  ),
  dim as (
    select id, name, a, b from cat
    union all
    select id, name, a, b from pay
  ),
  ranked as (
    select d.*, row_number() over (order by greatest(d.a, d.b) desc, d.name, d.id) as rn from dim d
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'by', case when p_by in ('category', 'payee') then p_by else 'total' end,
    'a', (select jsonb_build_object('debit', a_debit, 'credit', a_credit, 'net', a_credit - a_debit, 'count', a_count) from tot),
    'b', (select jsonb_build_object('debit', b_debit, 'credit', b_credit, 'net', b_credit - b_debit, 'count', b_count) from tot),
    'delta', (
      select jsonb_build_object(
        'debit', a_debit - b_debit,
        'debit_pct', case when b_debit > 0 then round((a_debit - b_debit) * 100 / b_debit, 1) end,
        'credit', a_credit - b_credit,
        'credit_pct', case when b_credit > 0 then round((a_credit - b_credit) * 100 / b_credit, 1) end,
        'net', (a_credit - a_debit) - (b_credit - b_debit)
      ) from tot
    ),
    'rows', (
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'a', r.a,
          'b', r.b,
          'delta', r.a - r.b,
          'delta_pct', case when r.b > 0 then round((r.a - r.b) * 100 / r.b, 1) end
        ) order by r.rn)
      from ranked r where r.rn <= 8
    ),
    'other', (
      select case when count(*) > 0 then jsonb_build_object(
        'items', count(*), 'a', sum(r.a), 'b', sum(r.b), 'delta', sum(r.a) - sum(r.b)
      ) end
      from ranked r where r.rn > 8
    )
  ))
$$;

-- budget_status: the monthly budget and per-category budgets against debit spend in [p_from, p_to).
-- `remaining` is negative when over budget. Category budgets: the 10 most used. Absent keys mean "not set".
create or replace function public.agent_budget_status(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with spent as (
    select coalesce(sum(t.amount), 0) as total
    from public.transactions t
    where t.user_id = (select auth.uid())
      and t.deleted_at is null
      and t.type::text = 'debit'
      and t.transaction_at >= p_from
      and t.transaction_at < p_to
  ),
  bud as (
    select b.monthly_budget, b.daily_budget
    from public.budgets b
    where b.user_id = (select auth.uid())
    limit 1
  ),
  cat_spent as (
    select t.category_id, sum(t.amount) as s
    from public.transactions t
    where t.user_id = (select auth.uid())
      and t.deleted_at is null
      and t.type::text = 'debit'
      and t.transaction_at >= p_from
      and t.transaction_at < p_to
      and t.category_id is not null
    group by t.category_id
  ),
  cats as (
    select
      cb.category_id,
      c.name,
      cb.monthly_amount as budget,
      coalesce(cs.s, 0) as spent
    from public.category_budgets cb
    join public.categories c on c.id = cb.category_id
    left join cat_spent cs on cs.category_id = cb.category_id
    where cb.user_id = (select auth.uid())
      and cb.monthly_amount is not null
      and cb.monthly_amount > 0
    order by coalesce(cs.s, 0) / cb.monthly_amount desc, c.name
    limit 10
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'total_spent', (select total from spent),
    'monthly', (
      select case when b.monthly_budget is not null and b.monthly_budget > 0 then jsonb_build_object(
        'budget', b.monthly_budget,
        'spent', s.total,
        'remaining', b.monthly_budget - s.total,
        'pct_used', round(s.total * 100 / b.monthly_budget, 1),
        'over', s.total > b.monthly_budget
      ) end
      from bud b cross join spent s
    ),
    'daily_budget', (select case when daily_budget > 0 then daily_budget end from bud),
    'categories', coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'category_id', ct.category_id,
           'name', ct.name,
           'budget', ct.budget,
           'spent', ct.spent,
           'remaining', ct.budget - ct.spent,
           'pct_used', round(ct.spent * 100 / ct.budget, 1),
           'over', ct.spent > ct.budget
         ) order by ct.spent / ct.budget desc, ct.name)
       from cats ct),
      '[]'::jsonb)
  ))
$$;

-- list_transactions: up to 20 matching rows, with ONLY date (local, p_tz), amount, type, payee display
-- name and category name. `total_count` counts every match. p_order: date_desc (default) | date_asc |
-- amount_desc | amount_asc. p_type: 'debit' | 'credit' | null (both). `note` is never returned.
create or replace function public.agent_list_transactions(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text,
  p_category_id uuid default null,
  p_payee_key text default null,
  p_min_amount numeric default null,
  p_type text default null,
  p_order text default 'date_desc',
  p_limit integer default 10
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with f as (
    select t.id, t.amount, t.type::text as typ, t.transaction_at, t.category_id, t.counterparty_name
    from public.transactions t
    where t.user_id = (select auth.uid())
      and t.deleted_at is null
      and t.type::text in ('debit', 'credit')
      and t.transaction_at >= p_from
      and t.transaction_at < p_to
      and (p_category_id is null or t.category_id = p_category_id)
      and (p_payee_key is null or public.agent_payee_key(t.counterparty_normalized, t.counterparty_name) = p_payee_key)
      and (p_min_amount is null or t.amount >= p_min_amount)
      and (p_type is null or t.type::text = p_type)
  ),
  page as (
    select
      row_number() over (
        order by
          case when p_order = 'amount_desc' then f.amount end desc nulls last,
          case when p_order = 'amount_asc' then f.amount end asc nulls last,
          case when p_order = 'date_asc' then f.transaction_at end asc nulls last,
          f.transaction_at desc,
          f.id
      ) as rn,
      (f.transaction_at at time zone p_tz)::date as day,
      f.amount,
      f.typ,
      coalesce(nullif(btrim(f.counterparty_name), ''), 'Unknown') as payee,
      coalesce(c.name, 'Uncategorized') as category
    from f
    left join public.categories c on c.id = f.category_id
  ),
  total as (select count(*) as n from f)
  select jsonb_build_object(
    'total_count', (select n from total),
    'rows', coalesce(
      (select jsonb_agg(
         jsonb_build_object('date', pg.day, 'amount', pg.amount, 'type', pg.typ, 'payee', pg.payee, 'category', pg.category)
         order by pg.rn)
       from page pg
       where pg.rn <= least(greatest(coalesce(p_limit, 10), 1), 20)),
      '[]'::jsonb),
    'truncated', (select n from total) > least(greatest(coalesce(p_limit, 10), 1), 20)
  )
$$;

-- Grants: the tool functions are callable by `authenticated` only.
revoke all on function public.agent_payee_key(text, text) from public, anon, service_role;
grant execute on function public.agent_payee_key(text, text) to authenticated;

revoke all on function public.agent_resolve_entities(text[]) from public, anon, service_role;
grant execute on function public.agent_resolve_entities(text[]) to authenticated;

revoke all on function public.agent_spending_summary(timestamptz, timestamptz, uuid, text) from public, anon, service_role;
grant execute on function public.agent_spending_summary(timestamptz, timestamptz, uuid, text) to authenticated;

revoke all on function public.agent_category_breakdown(timestamptz, timestamptz, text) from public, anon, service_role;
grant execute on function public.agent_category_breakdown(timestamptz, timestamptz, text) to authenticated;

revoke all on function public.agent_top_payees(timestamptz, timestamptz, uuid, integer) from public, anon, service_role;
grant execute on function public.agent_top_payees(timestamptz, timestamptz, uuid, integer) to authenticated;

revoke all on function public.agent_daily_cashflow(timestamptz, timestamptz, text) from public, anon, service_role;
grant execute on function public.agent_daily_cashflow(timestamptz, timestamptz, text) to authenticated;

revoke all on function public.agent_compare_periods(timestamptz, timestamptz, timestamptz, timestamptz, text) from public, anon, service_role;
grant execute on function public.agent_compare_periods(timestamptz, timestamptz, timestamptz, timestamptz, text) to authenticated;

revoke all on function public.agent_budget_status(timestamptz, timestamptz) from public, anon, service_role;
grant execute on function public.agent_budget_status(timestamptz, timestamptz) to authenticated;

revoke all on function public.agent_list_transactions(timestamptz, timestamptz, text, uuid, text, numeric, text, text, integer) from public, anon, service_role;
grant execute on function public.agent_list_transactions(timestamptz, timestamptz, text, uuid, text, numeric, text, text, integer) to authenticated;

-- Daily token budget. One row per user and UTC day; written only by the API with the service role
-- (RLS on, no policies, no grants for client roles).
create table if not exists public.agent_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  turns integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.agent_usage enable row level security;
revoke all on table public.agent_usage from anon, authenticated;
grant all on table public.agent_usage to service_role;

-- agent_usage_add: atomic upsert-increment (one turn). Returns the new totals for the day.
create or replace function public.agent_usage_add(
  p_user_id uuid,
  p_day date,
  p_prompt_tokens bigint,
  p_completion_tokens bigint
)
returns jsonb
language sql
volatile
security invoker
set search_path = public
as $$
  insert into public.agent_usage as u (user_id, day, prompt_tokens, completion_tokens, turns)
  values (p_user_id, p_day, greatest(coalesce(p_prompt_tokens, 0), 0), greatest(coalesce(p_completion_tokens, 0), 0), 1)
  on conflict (user_id, day) do update
    set prompt_tokens = u.prompt_tokens + excluded.prompt_tokens,
        completion_tokens = u.completion_tokens + excluded.completion_tokens,
        turns = u.turns + 1,
        updated_at = now()
  returning jsonb_build_object(
    'prompt_tokens', u.prompt_tokens,
    'completion_tokens', u.completion_tokens,
    'turns', u.turns
  )
$$;

revoke all on function public.agent_usage_add(uuid, date, bigint, bigint) from public, anon, authenticated;
grant execute on function public.agent_usage_add(uuid, date, bigint, bigint) to service_role;

-- Thumbs up / down on an agent answer. `turn_id` is the id the final SSE / JSON response carried. One
-- rating per (user, turn): rating again replaces it (the API upserts with the service role). Clients
-- that talk to PostgREST directly may insert and read only their own rows.
create table if not exists public.agent_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  turn_id uuid not null,
  rating text not null check (rating in ('up', 'down')),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (user_id, turn_id)
);

alter table public.agent_feedback enable row level security;
-- Explicit grants (Supabase's default privileges would add more): clients may only insert and read, the
-- policies below narrow that to their own rows; the API writes with the service role.
revoke all on table public.agent_feedback from anon, authenticated;
grant select, insert on table public.agent_feedback to authenticated;
grant all on table public.agent_feedback to service_role;

drop policy if exists agent_feedback_insert_own on public.agent_feedback;
create policy agent_feedback_insert_own on public.agent_feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists agent_feedback_select_own on public.agent_feedback;
create policy agent_feedback_select_own on public.agent_feedback
  for select to authenticated
  using (user_id = (select auth.uid()));
