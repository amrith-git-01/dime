import { all, batch, chunks, first, fromFlag, newId, nowIso, placeholders, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import { DbCodedError, INSUFFICIENT_PRIVILEGE, NO_DATA_FOUND, WRONG_SCOPE } from '../../core/db-errors';
import { decimalToCents, formatCents } from '../../core/decimal';
import { DETAIL_COLUMNS } from '../transactions/schemas';
import type { TransactionRow } from '../transactions/schemas';
import { CATEGORY_COLUMNS } from './schemas';
import type { CategoryRow, CategoryScope } from './schemas';

/** Raw `categories` row: `is_system` is 0/1. */
interface CategoryDbRow extends Omit<CategoryRow, 'is_system'> {
  is_system: number;
}

/** Raw `transactions` row: money in integer cents. */
type TransactionDbRow = Omit<TransactionRow, 'amount'> & { amount: number };

const toCategoryRow = (row: CategoryDbRow): CategoryRow => ({ ...row, is_system: fromFlag(row.is_system) });

/** `NOCASE` gives case-insensitive ordering. */
const BY_NAME = 'ORDER BY name COLLATE NOCASE ASC, name ASC';

/**
 * System categories plus the user's own, ordered by name. One query serves lookups and uniqueness checks, so write paths
 * call it unfiltered (names must be unique across every scope); the list endpoint passes a `scope`.
 */
export async function listVisible(db: Db, userId: string, scope?: CategoryScope): Promise<CategoryRow[]> {
  const rows = await all<CategoryDbRow>(
    db,
    `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE (is_system = 1 OR user_id = ?)${scope ? ' AND scope = ?' : ''} ${BY_NAME}`,
    scope ? [userId, scope] : [userId],
  );
  return rows.map(toCategoryRow);
}

export async function insertCustom(
  db: Db,
  input: { userId: string; name: string; iconName: string; color: string },
): Promise<CategoryRow> {
  const row = await first<CategoryDbRow>(
    db,
    `INSERT INTO categories (id, user_id, name, icon_name, color, is_system, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?) RETURNING ${CATEGORY_COLUMNS}`,
    [newId(), input.userId, input.name, input.iconName, input.color, nowIso()],
  );
  if (!row) throw new Error('category insert returned no row');
  return toCategoryRow(row);
}

export async function updateCustom(
  db: Db,
  input: { userId: string; categoryId: string; name: string; iconName: string; color: string },
): Promise<CategoryRow | null> {
  const row = await first<CategoryDbRow>(
    db,
    `UPDATE categories SET name = ?, icon_name = ?, color = ?
     WHERE id = ? AND user_id = ? AND is_system = 0 RETURNING ${CATEGORY_COLUMNS}`,
    [input.name, input.iconName, input.color, input.categoryId, input.userId],
  );
  return row ? toCategoryRow(row) : null;
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

/**
 * Atomic category + budget change (C1).
 * Checks visibility first (NO_DATA_FOUND when the category does not exist or belongs to someone
 * else, INSUFFICIENT_PRIVILEGE when a system category would be edited), then applies the category
 * update and the budget upsert/delete in ONE `DB.batch`, which D1 runs as a single transaction.
 */
export async function updateCategoryWithBudget(db: Db, input: CategoryBudgetUpdate): Promise<CategoryBudgetPayload> {
  const categoryId = input.categoryId.toLowerCase();
  const current = await first<CategoryDbRow>(
    db,
    `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE id = ? AND (is_system = 1 OR user_id = ?)`,
    [categoryId, input.userId],
  );
  if (!current) throw new DbCodedError(NO_DATA_FOUND, 'category not found');
  // Budgets are for spending categories only (recurring categories are never budgeted; removing a stale budget is fine).
  if (input.setBudget && input.budgetAmount !== null && current.scope !== 'spend') {
    throw new DbCodedError(WRONG_SCOPE, 'only spending categories can have a budget');
  }

  const editsCategory = input.name !== null || input.iconName !== null || input.color !== null;
  if (editsCategory && fromFlag(current.is_system)) {
    throw new DbCodedError(INSUFFICIENT_PRIVILEGE, 'system categories cannot be edited');
  }

  const statements: D1PreparedStatement[] = [];
  if (editsCategory) {
    statements.push(
      stmt(
        db,
        `UPDATE categories SET name = COALESCE(?, name), icon_name = COALESCE(?, icon_name), color = COALESCE(?, color)
         WHERE id = ? AND user_id = ? AND is_system = 0 RETURNING ${CATEGORY_COLUMNS}`,
        [input.name, input.iconName, input.color, categoryId, input.userId],
      ),
    );
  }
  if (input.setBudget) {
    if (input.budgetAmount === null) {
      statements.push(stmt(db, 'DELETE FROM category_budgets WHERE user_id = ? AND category_id = ?', [input.userId, categoryId]));
    } else {
      const now = nowIso();
      statements.push(
        stmt(
          db,
          `INSERT INTO category_budgets (id, user_id, category_id, monthly_amount, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, category_id) DO UPDATE SET
             monthly_amount = excluded.monthly_amount, updated_at = excluded.updated_at`,
          [newId(), input.userId, categoryId, decimalToCents(input.budgetAmount), now, now],
        ),
      );
    }
  }
  statements.push(
    stmt(db, 'SELECT monthly_amount FROM category_budgets WHERE user_id = ? AND category_id = ?', [input.userId, categoryId]),
  );

  const results = await batch<Record<string, unknown>>(db, statements);
  let category = current;
  if (editsCategory) {
    const updated = results[0]?.[0] as CategoryDbRow | undefined;
    if (!updated) throw new DbCodedError(NO_DATA_FOUND, 'category not found'); // deleted between check and write
    category = updated;
  }
  const budget = results[results.length - 1]?.[0] as { monthly_amount: number } | undefined;
  return { category: toCategoryRow(category), monthly_amount: budget ? formatCents(budget.monthly_amount) : null };
}

export async function countActiveTransactions(db: Db, userId: string, categoryId: string): Promise<number> {
  const row = await first<{ n: number }>(
    db,
    'SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND category_id = ? AND deleted_at IS NULL',
    [userId, categoryId.toLowerCase()],
  );
  return row?.n ?? 0;
}

/**
 * `transactions` stores only `category_id` (the name is resolved on read): update nothing else.
 * Returns the rows as stored after the move (for the live-update broadcast).
 */
export async function reassignTransactions(
  db: Db,
  input: { userId: string; fromCategoryId: string; toCategoryId: string },
): Promise<TransactionRow[]> {
  const rows = await all<TransactionDbRow>(
    db,
    `UPDATE transactions SET category_id = ?, updated_at = ? WHERE user_id = ? AND category_id = ? AND deleted_at IS NULL
     RETURNING ${DETAIL_COLUMNS}`,
    [input.toCategoryId.toLowerCase(), nowIso(), input.userId, input.fromCategoryId.toLowerCase()],
  );
  return rows.map((row) => ({ ...row, amount: formatCents(row.amount) }));
}

export async function deleteCustom(db: Db, userId: string, categoryId: string): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    'DELETE FROM categories WHERE id = ? AND user_id = ? AND is_system = 0 RETURNING id',
    [categoryId.toLowerCase(), userId],
  );
  return row !== null;
}

export interface CategoryMeta {
  id: string;
  name: string;
  icon_name: string | null;
  color: string | null;
  is_system: boolean;
  scope: CategoryScope;
}

/** Display fields for a set of category ids, limited to categories visible to the user (system + own). */
export async function fetchMetaByIds(db: Db, ids: readonly string[], userId: string): Promise<Map<string, CategoryMeta>> {
  const out = new Map<string, CategoryMeta>();
  if (ids.length === 0) return out;
  // D1 allows 100 bound parameters per statement.
  for (const part of chunks(ids, 80)) {
    const rows = await all<Omit<CategoryMeta, 'is_system'> & { is_system: number }>(
      db,
      `SELECT id, name, icon_name, color, is_system, scope FROM categories
       WHERE id IN (${placeholders(part.length)}) AND (is_system = 1 OR user_id = ?)`,
      [...part.map((id) => id.toLowerCase()), userId],
    );
    for (const row of rows) out.set(String(row.id).toLowerCase(), { ...row, is_system: fromFlag(row.is_system) });
  }
  return out;
}

/** Just `id,name,scope` of every category visible to the user: resolves an id or a name in one query. */
export async function listVisibleIdName(db: Db, userId: string): Promise<{ id: string; name: string; scope: CategoryScope }[]> {
  return all<{ id: string; name: string; scope: CategoryScope }>(
    db,
    `SELECT id, name, scope FROM categories WHERE is_system = 1 OR user_id = ? ${BY_NAME}`,
    [userId],
  );
}
