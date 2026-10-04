-- C1: update a category and its monthly budget atomically.
--
-- Called by the API with the service role, so the caller's user id is passed explicitly (p_user_id)
-- and every statement filters by it. SECURITY INVOKER keeps RLS in force for any non-service caller;
-- EXECUTE is revoked from anon/authenticated so clients cannot call it with someone else's id.
--
-- p_name / p_icon_name / p_color: NULL = leave unchanged (system categories may not be changed).
-- p_set_budget = false  -> budget untouched
-- p_set_budget = true   -> p_budget_amount NULL deletes the budget, otherwise upserts it.
--
-- Errors: P0002 category not found / not visible, 42501 attempt to edit a system category.
-- Assumes public.category_budgets(user_id, category_id, monthly_amount, updated_at) with a
-- unique (user_id, category_id), as used by the API's upsert.

create or replace function public.update_category_with_budget(
  p_user_id uuid,
  p_category_id uuid,
  p_name text default null,
  p_icon_name text default null,
  p_color text default null,
  p_set_budget boolean default false,
  p_budget_amount numeric default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cat public.categories;
  v_budget numeric;
begin
  if p_user_id is null then
    raise exception 'user id is required' using errcode = '22023';
  end if;

  select * into v_cat
  from public.categories c
  where c.id = p_category_id
    and (c.is_system = true or c.user_id = p_user_id);
  if not found then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  if p_name is not null or p_icon_name is not null or p_color is not null then
    if v_cat.is_system then
      raise exception 'system categories cannot be edited' using errcode = '42501';
    end if;
    update public.categories c
       set name = coalesce(p_name, c.name),
           icon_name = coalesce(p_icon_name, c.icon_name),
           color = coalesce(p_color, c.color)
     where c.id = p_category_id
       and c.user_id = p_user_id
       and c.is_system = false
    returning * into v_cat;
    if not found then
      raise exception 'category not found' using errcode = 'P0002';
    end if;
  end if;

  if p_set_budget then
    if p_budget_amount is null then
      delete from public.category_budgets b
       where b.user_id = p_user_id and b.category_id = p_category_id;
    else
      insert into public.category_budgets (user_id, category_id, monthly_amount)
      values (p_user_id, p_category_id, p_budget_amount)
      on conflict (user_id, category_id)
      do update set monthly_amount = excluded.monthly_amount, updated_at = now();
    end if;
  end if;

  select b.monthly_amount into v_budget
  from public.category_budgets b
  where b.user_id = p_user_id and b.category_id = p_category_id;

  return jsonb_build_object('category', to_jsonb(v_cat), 'monthly_amount', v_budget);
end;
$$;

revoke all on function public.update_category_with_budget(uuid, uuid, text, text, text, boolean, numeric)
  from public, anon, authenticated;
grant execute on function public.update_category_with_budget(uuid, uuid, text, text, text, boolean, numeric)
  to service_role;
