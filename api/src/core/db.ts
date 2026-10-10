import type { Context } from 'hono';

import type { AppBindings } from './env';

/**
 * Thin typed helpers over D1 (no ORM). Repositories take a `Db`. Conventions (see `migrations/0001_init.sql`): ids are text uuids made here,
 * money is integer cents, timestamps are `toISOString()` text, booleans are 0/1, JSON is text.
 */
export type Db = D1Database;

export type SqlParam = string | number | null;

/** The D1 binding for this request. */
export function getDb(c: Context<AppBindings>): Db {
  return c.env.DB;
}

export const newId = (): string => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();

export function stmt(db: Db, sql: string, params: readonly SqlParam[] = []): D1PreparedStatement {
  return db.prepare(sql).bind(...params);
}

/** First row or null. */
export async function first<T>(db: Db, sql: string, params: readonly SqlParam[] = []): Promise<T | null> {
  return stmt(db, sql, params).first<T>();
}

export async function all<T>(db: Db, sql: string, params: readonly SqlParam[] = []): Promise<T[]> {
  const { results } = await stmt(db, sql, params).all<T>();
  return results;
}

/** Rows changed by a write. */
export async function run(db: Db, sql: string, params: readonly SqlParam[] = []): Promise<number> {
  const res = await stmt(db, sql, params).run();
  return res.meta.changes ?? 0;
}

/** Statements in one implicit transaction: all or nothing. Rows of `RETURNING` come back per statement. */
export async function batch<T = unknown>(db: Db, statements: D1PreparedStatement[]): Promise<T[][]> {
  if (statements.length === 0) return [];
  const results = await db.batch<T>(statements);
  return results.map((r) => r.results);
}

/** `?,?,?` for an IN list. D1 allows at most 100 bound parameters per statement, so keep lists short. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',');
}

export function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const toFlag = (value: boolean): 0 | 1 => (value ? 1 : 0);
export const fromFlag = (value: unknown): boolean => value === 1 || value === true || value === '1';

/** JSON column -> object; `null` for a missing or unparseable value. */
export function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
