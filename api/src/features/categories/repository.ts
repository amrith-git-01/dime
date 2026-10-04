import type { DimeSupabaseClient } from '../../core/supabase';
import { CATEGORY_COLUMNS } from './schemas';
import type { CategoryRow } from './schemas';

/** System categories plus the user's own, ordered by name. One query serves lookups and uniqueness checks. */
export async function listVisible(db: DimeSupabaseClient, userId: string): Promise<CategoryRow[]> {
  const { data } = await db
    .from('categories')
    .select(CATEGORY_COLUMNS)
    .or(`is_system.eq.true,user_id.eq.${userId}`)
    .order('name', { ascending: true })
    .throwOnError()
    .overrideTypes<CategoryRow[], { merge: false }>();
  return data;
}

export async function insertCustom(
  db: DimeSupabaseClient,
  input: { userId: string; name: string; iconName: string; color: string },
): Promise<CategoryRow> {
  const { data } = await db
    .from('categories')
    .insert({ user_id: input.userId, name: input.name, icon_name: input.iconName, color: input.color, is_system: false })
    .select(CATEGORY_COLUMNS)
    .single()
    .throwOnError()
    .overrideTypes<CategoryRow, { merge: false }>();
  return data;
}

export async function updateCustom(
  db: DimeSupabaseClient,
  input: { userId: string; categoryId: string; name: string; iconName: string; color: string },
): Promise<CategoryRow | null> {
  const { data } = await db
    .from('categories')
    .update({ name: input.name, icon_name: input.iconName, color: input.color })
    .eq('id', input.categoryId)
    .eq('user_id', input.userId)
    .eq('is_system', false)
    .select(CATEGORY_COLUMNS)
    .throwOnError()
    .overrideTypes<CategoryRow[], { merge: false }>();
  return data[0] ?? null;
}

export interface CategoryBudgetUpdate {
  userId: string;
  categoryId: string;
  name: string | null;
  iconName: string | null;
  color: string | null;
  setBudget: boolean;
  /** Canonical decimal string; null with `setBudget` deletes the budget. */
  budgetAmount: string | null;
}

export interface CategoryBudgetPayload {
  category: CategoryRow;
  monthly_amount: number | string | null;
}

/** Atomic category + budget change via the `update_category_with_budget` SQL function (C1). */
export async function updateCategoryWithBudget(
  db: DimeSupabaseClient,
  input: CategoryBudgetUpdate,
): Promise<CategoryBudgetPayload> {
  const res = await db
    .rpc('update_category_with_budget', {
      p_user_id: input.userId,
      p_category_id: input.categoryId,
      p_name: input.name,
      p_icon_name: input.iconName,
      p_color: input.color,
      p_set_budget: input.setBudget,
      p_budget_amount: input.budgetAmount,
    })
    .throwOnError();
  const data: unknown = res.data;
  const payload = (Array.isArray(data) ? data[0] : data) as Partial<CategoryBudgetPayload> | null | undefined;
  if (!payload || typeof payload.category !== 'object' || payload.category === null) {
    throw new Error('update_category_with_budget returned an unexpected payload.');
  }
  return { category: payload.category, monthly_amount: payload.monthly_amount ?? null };
}

export async function countActiveTransactions(db: DimeSupabaseClient, userId: string, categoryId: string): Promise<number> {
  const { count } = await db
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .is('deleted_at', null)
    .throwOnError();
  return count ?? 0;
}

/** `transactions` stores only `category_id` (the name is resolved on read): update nothing else. */
export async function reassignTransactions(
  db: DimeSupabaseClient,
  input: { userId: string; fromCategoryId: string; toCategoryId: string },
): Promise<void> {
  await db
    .from('transactions')
    .update({ category_id: input.toCategoryId })
    .eq('user_id', input.userId)
    .eq('category_id', input.fromCategoryId)
    .is('deleted_at', null)
    .throwOnError();
}

export async function deleteCustom(db: DimeSupabaseClient, userId: string, categoryId: string): Promise<boolean> {
  const { data } = await db
    .from('categories')
    .delete()
    .eq('id', categoryId)
    .eq('user_id', userId)
    .eq('is_system', false)
    .select('id')
    .throwOnError()
    .overrideTypes<{ id: string }[], { merge: false }>();
  return data.length > 0;
}

export interface CategoryMeta {
  id: string;
  name: string;
  icon_name: string | null;
  color: string | null;
  is_system: boolean;
}

/** Display fields for a set of category ids, limited to categories visible to the user (system + own). */
export async function fetchMetaByIds(
  db: DimeSupabaseClient,
  ids: readonly string[],
  userId: string,
): Promise<Map<string, CategoryMeta>> {
  const out = new Map<string, CategoryMeta>();
  if (ids.length === 0) return out;
  const { data } = await db
    .from('categories')
    .select('id,name,icon_name,color,is_system')
    .in('id', [...ids])
    .or(`is_system.eq.true,user_id.eq.${userId}`)
    .throwOnError()
    .overrideTypes<CategoryMeta[], { merge: false }>();
  for (const row of data) out.set(String(row.id).toLowerCase(), row);
  return out;
}

/** Just `id,name` of every category visible to the user: resolves an id or a name in one query. */
export async function listVisibleIdName(db: DimeSupabaseClient, userId: string): Promise<{ id: string; name: string }[]> {
  const { data } = await db
    .from('categories')
    .select('id,name')
    .or(`is_system.eq.true,user_id.eq.${userId}`)
    .throwOnError()
    .overrideTypes<{ id: string; name: string }[], { merge: false }>();
  return data;
}
