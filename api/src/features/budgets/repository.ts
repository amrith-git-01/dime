import type { DimeSupabaseClient } from '../../core/supabase';
import { updateCategoryWithBudget } from '../categories/repository';
import type { CategoryBudgetPayload } from '../categories/repository';
import { BUDGET_COLUMNS } from './schemas';
import type { BudgetRow } from './schemas';

export async function fetchBudget(db: DimeSupabaseClient, userId: string): Promise<BudgetRow | null> {
  const { data } = await db
    .from('budgets')
    .select(BUDGET_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()
    .throwOnError()
    .overrideTypes<BudgetRow, { merge: false }>();
  return data;
}

/** Update only the supplied columns of an existing row; null when the user has no budget row yet. */
export async function updateBudget(
  db: DimeSupabaseClient,
  userId: string,
  fields: { monthly_budget?: string; daily_budget?: string },
): Promise<BudgetRow | null> {
  const { data } = await db
    .from('budgets')
    .update(fields)
    .eq('user_id', userId)
    .select(BUDGET_COLUMNS)
    .throwOnError()
    .overrideTypes<BudgetRow[], { merge: false }>();
  return data[0] ?? null;
}

export async function insertBudget(
  db: DimeSupabaseClient,
  userId: string,
  amounts: { monthly_budget: string; daily_budget: string },
): Promise<BudgetRow> {
  const { data } = await db
    .from('budgets')
    .upsert({ user_id: userId, ...amounts }, { onConflict: 'user_id' })
    .select(BUDGET_COLUMNS)
    .single()
    .throwOnError()
    .overrideTypes<BudgetRow, { merge: false }>();
  return data;
}

export async function listCategoryBudgets(
  db: DimeSupabaseClient,
  userId: string,
): Promise<{ category_id: string; monthly_amount: number | string | null }[]> {
  const { data } = await db
    .from('category_budgets')
    .select('category_id,monthly_amount')
    .eq('user_id', userId)
    .throwOnError()
    .overrideTypes<{ category_id: string; monthly_amount: number | string | null }[], { merge: false }>();
  return data;
}

/**
 * Set (amount) or remove (null) one category budget. Uses the `update_category_with_budget` SQL
 * function with no category fields, so visibility check + write are one atomic round trip; it
 * raises P0002 when the category does not exist or is not visible to the user.
 */
export function setCategoryBudget(
  db: DimeSupabaseClient,
  userId: string,
  categoryId: string,
  amount: string | null,
): Promise<CategoryBudgetPayload> {
  return updateCategoryWithBudget(db, {
    userId,
    categoryId,
    name: null,
    iconName: null,
    color: null,
    setBudget: true,
    budgetAmount: amount,
  });
}

/** The user's monthly budget for one category; null when none is set. */
export async function fetchCategoryBudget(
  db: DimeSupabaseClient,
  userId: string,
  categoryId: string,
): Promise<{ monthly_amount: number | string | null } | null> {
  const { data } = await db
    .from('category_budgets')
    .select('monthly_amount')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .maybeSingle()
    .throwOnError()
    .overrideTypes<{ monthly_amount: number | string | null }, { merge: false }>();
  return data;
}
