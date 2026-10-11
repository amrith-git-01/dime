import { first } from '../../core/db';
import type { Db } from '../../core/db';
import { resolveEntities } from './entities';
import { runGuardedSql } from './sql-guard';
import type { SqlOutcome } from './sql-guard';

/**
 * The database seams of the agent. Tests replace single ones; production uses `defaultQueries`.
 * Every function takes the user id from the verified token (never from the model) and binds it.
 */
export interface AgentQueries {
  /** Fuzzy payee / category lookup: `{ matches: [...] }`. */
  resolve_entities: (db: Db, userId: string, params: { phrases: readonly string[] }) => Promise<Record<string, unknown>>;
  /** The model's SELECT, run through the SQL guard. */
  run_sql: (db: Db, userId: string, params: { sql: string; tzOffsetMinutes: number; signal?: AbortSignal }) => Promise<SqlOutcome>;
  /** The display name of a payee or category when it belongs to the user, else null (what a deep link may point at). */
  link_target: (db: Db, userId: string, params: { filter: 'payee' | 'category'; id: string }) => Promise<{ name: string } | null>;
}

async function linkTarget(db: Db, userId: string, p: { filter: 'payee' | 'category'; id: string }): Promise<{ name: string } | null> {
  if (p.filter === 'category') {
    const row = await first<{ name: string }>(db, 'SELECT name FROM categories WHERE id = ? AND (is_system = 1 OR user_id = ?) LIMIT 1', [p.id, userId]);
    return row ? { name: row.name } : null;
  }
  // The oldest row with a name, as the display name of the payee group.
  const row = await first<{ name: string | null }>(
    db,
    `SELECT counterparty_name AS name FROM transactions WHERE user_id = ? AND deleted_at IS NULL AND payee_key = ?
     ORDER BY (counterparty_name IS NULL OR TRIM(counterparty_name) = ''), transaction_at LIMIT 1`,
    [userId, p.id],
  );
  return row ? { name: row.name?.trim() || 'Unknown' } : null;
}

export const defaultQueries: AgentQueries = {
  resolve_entities: resolveEntities,
  run_sql: (db, userId, p) => runGuardedSql(db, userId, p.sql, { tzOffsetMinutes: p.tzOffsetMinutes, ...(p.signal ? { signal: p.signal } : {}) }),
  link_target: linkTarget,
};
