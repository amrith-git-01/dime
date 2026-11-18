import { NO_DATA_FOUND, WRONG_SCOPE, hasPgCode } from '../../core/db-errors';
import { formatMoney } from '../../core/decimal';
import { NotFoundError, UpstreamError, ValidationError } from '../../core/errors';
import { log } from '../../core/logging';
import type { Db } from '../../core/db';
import { isoUtc } from '../../core/timestamps';
import type { AfterWrite } from '../notifications/budget-alerts';
import { currentMonthKey } from '../user-settings/service';
import * as repo from './repository';
import type { BudgetResponse, BudgetRow, BudgetUpsertBody, CategoryBudgetItem } from './schemas';

function rowToBudget(row: BudgetRow): BudgetResponse {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    monthly_budget: formatMoney(row.monthly_budget),
    created_at: isoUtc(row.created_at),
    updated_at: isoUtc(row.updated_at),
  };
}

export async function getBudget(db: Db, userId: string): Promise<{ budget: BudgetResponse | null }> {
  const row = await repo.fetchBudget(db, userId);
  return { budget: row ? rowToBudget(row) : null };
}

/**
 * Set the monthly budget (`daily_amount` from old clients is ignored). It applies from the current month on (past months keep
 * their cap); `afterWrite` then re-checks that month's budget alerts against the new cap.
 */
export async function upsertBudget(db: Db, userId: string, body: BudgetUpsertBody, afterWrite?: AfterWrite): Promise<BudgetResponse> {
  const monthKey = await currentMonthKey(db, userId);
  const row = await repo.upsertBudget(db, userId, body.monthly_amount, monthKey);
  await afterWrite?.([monthKey]);
  return rowToBudget(row);
}

export async function listCategoryBudgets(db: Db, userId: string): Promise<{ items: CategoryBudgetItem[] }> {
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
  db: Db,
  userId: string,
  categoryId: string,
  amount: string | null,
  failure: string,
  afterWrite?: AfterWrite,
) {
  const monthKey = await currentMonthKey(db, userId);
  let payload: Awaited<ReturnType<typeof repo.setCategoryBudget>>;
  try {
    payload = await repo.setCategoryBudget(db, userId, categoryId, amount, monthKey);
  } catch (err) {
    // A malformed id can never match a category, so it is a plain not-found too.
    if (hasPgCode(err, NO_DATA_FOUND)) {
      throw new NotFoundError('Category not found.');
    }
    if (hasPgCode(err, WRONG_SCOPE)) throw new ValidationError('Only spending categories can have a budget.');
    log.error('category_budget_write_failed', { err });
    throw new UpstreamError(failure);
  }
  await afterWrite?.([monthKey]);
  return payload;
}

export async function upsertCategoryBudget(
  db: Db,
  userId: string,
  categoryId: string,
  amount: string,
  afterWrite?: AfterWrite,
): Promise<CategoryBudgetItem> {
  const payload = await writeCategoryBudget(db, userId, categoryId, amount, 'Could not save category budget.', afterWrite);
  return { category_id: categoryId, monthly_amount: formatMoney(payload.monthly_amount ?? amount) };
}

export async function deleteCategoryBudget(db: Db, userId: string, categoryId: string, afterWrite?: AfterWrite): Promise<void> {
  await writeCategoryBudget(db, userId, categoryId, null, 'Could not remove category budget.', afterWrite);
}
