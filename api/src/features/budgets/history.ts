import { all, first, nowIso, stmt } from '../../core/db';
import type { Db } from '../../core/db';

/**
 * Budget history: the cap in force per month (`budget_history`). Setting a budget writes the current month and applies from
 * then on; past months keep the cap they had, so a month's numbers never change when the budget is edited later.
 */

/**
 * Statements (for a `db.batch`) that set the cap of one scope from `monthKey` on. 0 means "no cap" (a removed category budget,
 * a monthly budget set to zero), so later months stop using an earlier month's value.
 */
export function historyStatements(
  db: Db,
  input: { userId: string; monthKey: string; scope: 'monthly' | 'category'; categoryId: string | null; cents: number },
): D1PreparedStatement[] {
  const { userId, monthKey, scope, categoryId, cents } = input;
  return [
    stmt(db, 'DELETE FROM budget_history WHERE user_id = ? AND month_key = ? AND scope = ? AND category_id IS ?', [userId, monthKey, scope, categoryId]),
    stmt(
      db,
      'INSERT INTO budget_history (user_id, month_key, scope, category_id, amount_cents, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, monthKey, scope, categoryId, cents, nowIso()],
    ),
  ];
}

/** The monthly cap (cents) in force for `monthKey`: the latest history row at or before it; 0 when there is none. */
export async function monthlyCapCents(db: Db, userId: string, monthKey: string): Promise<number> {
  const row = await first<{ amount_cents: number }>(
    db,
    `SELECT amount_cents FROM budget_history WHERE user_id = ? AND scope = 'monthly' AND month_key <= ? ORDER BY month_key DESC LIMIT 1`,
    [userId, monthKey],
  );
  return row?.amount_cents ?? 0;
}

/** The category caps (cents, by category id) in force for `monthKey`; categories without a cap are absent. */
export async function categoryCapsCents(db: Db, userId: string, monthKey: string): Promise<Map<string, number>> {
  const rows = await all<{ category_id: string; amount_cents: number }>(
    db,
    `SELECT h.category_id AS category_id, h.amount_cents AS amount_cents FROM budget_history h
     WHERE h.user_id = ? AND h.scope = 'category' AND h.month_key = (
       SELECT MAX(h2.month_key) FROM budget_history h2
       WHERE h2.user_id = h.user_id AND h2.scope = 'category' AND h2.category_id = h.category_id AND h2.month_key <= ?)`,
    [userId, monthKey],
  );
  return new Map(rows.filter((r) => r.amount_cents > 0).map((r) => [r.category_id, r.amount_cents]));
}
