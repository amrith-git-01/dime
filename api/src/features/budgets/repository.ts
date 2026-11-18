import { all, batch, first, newId, nowIso, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import { decimalToCents, formatCents } from '../../core/decimal';
import { updateCategoryWithBudget } from '../categories/repository';
import { historyStatements } from './history';
import type { CategoryBudgetPayload } from '../categories/repository';
import { BUDGET_COLUMNS } from './schemas';
import type { BudgetRow } from './schemas';

/** Raw `budgets` row: money in integer cents. */
interface BudgetDbRow {
  id: string;
  user_id: string;
  monthly_budget: number;
  created_at: string;
  updated_at: string;
}

function toBudgetRow(row: BudgetDbRow): BudgetRow {
  return {
    id: row.id,
    user_id: row.user_id,
    monthly_budget: formatCents(row.monthly_budget),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchBudget(db: Db, userId: string): Promise<BudgetRow | null> {
  const row = await first<BudgetDbRow>(db, `SELECT ${BUDGET_COLUMNS} FROM budgets WHERE user_id = ?`, [userId]);
  return row ? toBudgetRow(row) : null;
}

/**
 * Set the monthly budget: the current value (`budgets`, what GET /budget reads) and the month's cap in the history, in ONE
 * batch. Past months keep the cap they had; this month and the ones after it use the new one.
 */
export async function upsertBudget(db: Db, userId: string, monthlyBudget: string, monthKey: string): Promise<BudgetRow> {
  const now = nowIso();
  const cents = decimalToCents(monthlyBudget);
  const [rows] = await batch<BudgetDbRow>(db, [
    stmt(
      db,
      `INSERT INTO budgets (id, user_id, monthly_budget, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET monthly_budget = excluded.monthly_budget, updated_at = excluded.updated_at
       RETURNING ${BUDGET_COLUMNS}`,
      [newId(), userId, cents, now, now],
    ),
    ...historyStatements(db, { userId, monthKey, scope: 'monthly', categoryId: null, cents }),
  ]);
  const row = rows?.[0];
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
  monthKey: string,
): Promise<CategoryBudgetPayload> {
  return updateCategoryWithBudget(db, {
    userId,
    categoryId,
    name: null,
    iconName: null,
    color: null,
    setBudget: true,
    budgetAmount: amount,
    monthKey,
  });
}
