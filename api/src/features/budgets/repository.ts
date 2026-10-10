import { all, first, newId, nowIso } from '../../core/db';
import type { Db, SqlParam } from '../../core/db';
import { decimalToCents, formatCents } from '../../core/decimal';
import { updateCategoryWithBudget } from '../categories/repository';
import type { CategoryBudgetPayload } from '../categories/repository';
import { BUDGET_COLUMNS } from './schemas';
import type { BudgetRow } from './schemas';

/** Raw `budgets` row: money in integer cents. */
interface BudgetDbRow {
  id: string;
  user_id: string;
  monthly_budget: number;
  daily_budget: number | null;
  created_at: string;
  updated_at: string;
}

function toBudgetRow(row: BudgetDbRow): BudgetRow {
  return {
    id: row.id,
    user_id: row.user_id,
    monthly_budget: formatCents(row.monthly_budget),
    daily_budget: formatCents(row.daily_budget ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchBudget(db: Db, userId: string): Promise<BudgetRow | null> {
  const row = await first<BudgetDbRow>(db, `SELECT ${BUDGET_COLUMNS} FROM budgets WHERE user_id = ?`, [userId]);
  return row ? toBudgetRow(row) : null;
}

/** Update only the supplied columns of an existing row; null when the user has no budget row yet. */
export async function updateBudget(
  db: Db,
  userId: string,
  fields: { monthly_budget?: string; daily_budget?: string },
): Promise<BudgetRow | null> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  if (fields.monthly_budget !== undefined) {
    sets.push('monthly_budget = ?');
    params.push(decimalToCents(fields.monthly_budget));
  }
  if (fields.daily_budget !== undefined) {
    sets.push('daily_budget = ?');
    params.push(decimalToCents(fields.daily_budget));
  }
  sets.push('updated_at = ?');
  params.push(nowIso(), userId);
  const row = await first<BudgetDbRow>(
    db,
    `UPDATE budgets SET ${sets.join(', ')} WHERE user_id = ? RETURNING ${BUDGET_COLUMNS}`,
    params,
  );
  return row ? toBudgetRow(row) : null;
}

export async function insertBudget(
  db: Db,
  userId: string,
  amounts: { monthly_budget: string; daily_budget: string },
): Promise<BudgetRow> {
  const now = nowIso();
  const row = await first<BudgetDbRow>(
    db,
    `INSERT INTO budgets (id, user_id, monthly_budget, daily_budget, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       monthly_budget = excluded.monthly_budget, daily_budget = excluded.daily_budget, updated_at = excluded.updated_at
     RETURNING ${BUDGET_COLUMNS}`,
    [newId(), userId, decimalToCents(amounts.monthly_budget), decimalToCents(amounts.daily_budget), now, now],
  );
  if (!row) throw new Error('budget upsert returned no row');
  return toBudgetRow(row);
}

export async function listCategoryBudgets(
  db: Db,
  userId: string,
): Promise<{ category_id: string; monthly_amount: number | string | null }[]> {
  const rows = await all<{ category_id: string; monthly_amount: number }>(
    db,
    'SELECT category_id, monthly_amount FROM category_budgets WHERE user_id = ?',
    [userId],
  );
  return rows.map((r) => ({ category_id: r.category_id, monthly_amount: formatCents(r.monthly_amount) }));
}

/**
 * Set (amount) or remove (null) one category budget. Uses `updateCategoryWithBudget` with no
 * category fields, so the visibility check and the write are one atomic batch; it raises
 * NO_DATA_FOUND when the category does not exist or is not visible to the user.
 */
export function setCategoryBudget(
  db: Db,
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
  db: Db,
  userId: string,
  categoryId: string,
): Promise<{ monthly_amount: number | string | null } | null> {
  const row = await first<{ monthly_amount: number }>(
    db,
    'SELECT monthly_amount FROM category_budgets WHERE user_id = ? AND category_id = ?',
    [userId, categoryId.toLowerCase()],
  );
  return row ? { monthly_amount: formatCents(row.monthly_amount) } : null;
}
