import { INVALID_TEXT_REPRESENTATION, NO_DATA_FOUND, hasPgCode } from '../../core/db-errors';
import { formatMoney } from '../../core/decimal';
import { NotFoundError, UpstreamError } from '../../core/errors';
import { log } from '../../core/logging';
import type { DimeSupabaseClient } from '../../core/supabase';
import { isoUtc } from '../../core/timestamps';
import * as repo from './repository';
import type { BudgetResponse, BudgetRow, BudgetUpsertBody, CategoryBudgetItem } from './schemas';

function rowToBudget(row: BudgetRow): BudgetResponse {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    monthly_budget: formatMoney(row.monthly_budget),
    daily_budget: formatMoney(row.daily_budget),
    created_at: isoUtc(row.created_at),
    updated_at: isoUtc(row.updated_at),
  };
}

export async function getBudget(db: DimeSupabaseClient, userId: string): Promise<{ budget: BudgetResponse | null }> {
  const row = await repo.fetchBudget(db, userId);
  return { budget: row ? rowToBudget(row) : null };
}

/** Partial update (daily and/or monthly). One round trip for existing users; first save inserts zeros for the other cap. */
export async function upsertBudget(db: DimeSupabaseClient, userId: string, body: BudgetUpsertBody): Promise<BudgetResponse> {
  const fields: { monthly_budget?: string; daily_budget?: string } = {};
  if (body.monthly_amount != null) fields.monthly_budget = body.monthly_amount;
  if (body.daily_amount != null) fields.daily_budget = body.daily_amount;

  const updated = await repo.updateBudget(db, userId, fields);
  if (updated) return rowToBudget(updated);
  const created = await repo.insertBudget(db, userId, {
    monthly_budget: fields.monthly_budget ?? '0',
    daily_budget: fields.daily_budget ?? '0',
  });
  return rowToBudget(created);
}

export async function listCategoryBudgets(db: DimeSupabaseClient, userId: string): Promise<{ items: CategoryBudgetItem[] }> {
  const rows = await repo.listCategoryBudgets(db, userId);
  const items: CategoryBudgetItem[] = [];
  for (const row of rows) {
    if (typeof row.category_id === 'string' && row.monthly_amount != null) {
      items.push({ category_id: row.category_id, monthly_amount: formatMoney(row.monthly_amount) });
    }
  }
  return { items };
}

async function writeCategoryBudget(
  db: DimeSupabaseClient,
  userId: string,
  categoryId: string,
  amount: string | null,
  failure: string,
) {
  try {
    return await repo.setCategoryBudget(db, userId, categoryId, amount);
  } catch (err) {
    // A malformed id can never match a category.
    if (hasPgCode(err, NO_DATA_FOUND) || hasPgCode(err, INVALID_TEXT_REPRESENTATION)) {
      throw new NotFoundError('Category not found.');
    }
    log.error('category_budget_write_failed', { err });
    throw new UpstreamError(failure);
  }
}

export async function upsertCategoryBudget(
  db: DimeSupabaseClient,
  userId: string,
  categoryId: string,
  amount: string,
): Promise<CategoryBudgetItem> {
  const payload = await writeCategoryBudget(db, userId, categoryId, amount, 'Could not save category budget.');
  return { category_id: categoryId, monthly_amount: formatMoney(payload.monthly_amount ?? amount) };
}

export async function deleteCategoryBudget(db: DimeSupabaseClient, userId: string, categoryId: string): Promise<void> {
  await writeCategoryBudget(db, userId, categoryId, null, 'Could not remove category budget.');
}
