import { env as workerEnv } from 'cloudflare:workers';

import { decimalToCents } from '../src/core/decimal';
import { nowIso } from '../src/core/db';
import { normalizeCounterparty, normalizedOrNull, payeeKey } from '../src/features/transactions/dedupe';

/** The local D1 the tests (and the app under test) share. */
export const testDb = (): D1Database => workerEnv.DB;

export const USER_ID = '11111111-1111-1111-1111-111111111111';

/** Tables in delete order (children first), so the reset works even when foreign keys are not enforced. */
const TABLES = [
  'ai_user_usage',
  'ai_usage',
  'auth_sessions',
  'auth_identities',
  'agent_feedback',
  'agent_usage',
  'jobs',
  'email_sends',
  'user_push_tokens',
  'user_feedback',
  'user_settings',
  'notifications',
  'category_budgets',
  'budgets',
  'transactions',
  'recurring_items', // after transactions: they reference it
  'brand_aliases',
  'brands_fts', // virtual table: a plain DELETE empties it
  'brands', // after transactions and aliases: both reference it
];

/** Empty every table (system categories stay: they are seed data) and seed the default test user. */
export async function resetDb(): Promise<void> {
  const db = testDb();
  await db.batch([
    ...TABLES.map((t) => db.prepare(`DELETE FROM ${t}`)),
    db.prepare('DELETE FROM categories WHERE is_system = 0'),
    db.prepare('DELETE FROM users'),
  ]);
  await seedUser(USER_ID);
}

export async function seedUser(id: string, over: { username?: string | null; email?: string | null; currency?: string; avatar_url?: string | null } = {}) {
  const now = nowIso();
  await testDb()
    .prepare('INSERT INTO users (id, username, currency, avatar_url, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, over.username ?? null, over.currency ?? 'INR', over.avatar_url ?? null, over.email ?? null, now, now)
    .run();
}

let counter = 0;
/** Deterministic unique uuid-shaped ids for rows a test inserts. */
export const uid = (): string => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

export interface SeedTransaction {
  id?: string;
  user_id?: string;
  /** Decimal string or number, e.g. "250.50". */
  amount?: string | number;
  type?: 'debit' | 'credit';
  counterparty_name?: string | null;
  counterparty_normalized?: string | null;
  counterparty_type?: string | null;
  category_id?: string | null;
  note?: string | null;
  detected_via?: string | null;
  receipt_url?: string | null;
  voice_url?: string | null;
  transaction_at?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  payment_hash?: string | null;
  recurring_item_id?: string | null;
  brand_id?: string | null;
}

export async function seedTransaction(over: SeedTransaction = {}): Promise<string> {
  const id = over.id ?? uid();
  const name = over.counterparty_name === undefined ? 'Swiggy' : over.counterparty_name;
  const normalized = over.counterparty_normalized === undefined ? normalizedOrNull(name ?? '') : over.counterparty_normalized;
  const at = over.transaction_at ?? '2026-10-04T10:00:00.000Z';
  await testDb()
    .prepare(
      `INSERT INTO transactions (id, user_id, amount, type, note, detected_via, transaction_at, created_at, updated_at, deleted_at,
         category_id, receipt_url, voice_url, counterparty_name, counterparty_type, counterparty_normalized, payment_hash, payee_key, recurring_item_id, brand_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      over.user_id ?? USER_ID,
      decimalToCents(over.amount ?? '100.00'),
      over.type ?? 'debit',
      over.note ?? null,
      over.detected_via === undefined ? 'manual' : over.detected_via,
      at,
      over.created_at ?? at,
      over.updated_at ?? over.created_at ?? at,
      over.deleted_at ?? null,
      over.category_id ?? null,
      over.receipt_url ?? null,
      over.voice_url ?? null,
      name,
      over.counterparty_type === undefined ? 'merchant' : over.counterparty_type,
      normalized,
      over.payment_hash ?? null,
      payeeKey(normalized, name),
      over.recurring_item_id ?? null,
      over.brand_id ?? null,
    )
    .run();
  return id;
}

/** A catalogue brand with its aliases (the brand's own normalised name is always one), indexed for search like the catalogue script does. */
export async function seedBrand(over: { id: string; name: string; popularity?: number; domain?: string | null; category_id?: string | null; aliases?: string[] }) {
  const db = testDb();
  const aliases = [...new Set([normalizeCounterparty(over.name), ...(over.aliases ?? [])])];
  await db.batch([
    db
      .prepare("INSERT INTO brands (id, name, domain, category_id, popularity, source) VALUES (?, ?, ?, ?, ?, 'manual')")
      .bind(over.id, over.name, over.domain ?? null, over.category_id ?? null, over.popularity ?? 0),
    ...aliases.map((a) => db.prepare('INSERT INTO brand_aliases (alias, brand_id) VALUES (?, ?)').bind(a, over.id)),
    db.prepare('INSERT INTO brands_fts (brand_id, name, aliases) VALUES (?, ?, ?)').bind(over.id, over.name, (over.aliases ?? []).join(' ')),
  ]);
}

export async function seedCategory(over: { id?: string; user_id?: string | null; name: string; icon_name?: string; color?: string; is_system?: boolean; scope?: string; created_at?: string }) {
  const id = over.id ?? uid();
  await testDb()
    .prepare('INSERT INTO categories (id, user_id, name, icon_name, color, is_system, scope, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, over.is_system ? null : (over.user_id === undefined ? USER_ID : over.user_id), over.name, over.icon_name ?? 'Tag', over.color ?? '#94A3B8', over.is_system ? 1 : 0, over.scope ?? 'spend', over.created_at ?? '2026-07-01T00:00:00.000Z')
    .run();
  return id;
}

export async function seedBudget(over: { user_id?: string; monthly?: string } = {}) {
  const now = nowIso();
  await testDb()
    .prepare('INSERT INTO budgets (id, user_id, monthly_budget, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(uid(), over.user_id ?? USER_ID, decimalToCents(over.monthly ?? '0'), now, now)
    .run();
}

export async function seedCategoryBudget(categoryId: string, amount: string, userId: string = USER_ID) {
  const now = nowIso();
  await testDb()
    .prepare('INSERT INTO category_budgets (id, user_id, category_id, monthly_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(uid(), userId, categoryId, decimalToCents(amount), now, now)
    .run();
}

export async function seedSettings(over: Record<string, number | string> = {}, userId: string = USER_ID) {
  const columns = ['user_id', ...Object.keys(over)];
  await testDb()
    .prepare(`INSERT INTO user_settings (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .bind(userId, ...Object.values(over))
    .run();
}

export async function seedNotification(over: {
  id?: string;
  user_id?: string;
  kind?: string;
  title?: string;
  body?: string;
  action_type?: string | null;
  action_transaction_id?: string | null;
  dedupe_key?: string | null;
  read_at?: string | null;
  deleted_at?: string | null;
  created_at?: string;
}) {
  const id = over.id ?? uid();
  await testDb()
    .prepare(
      `INSERT INTO notifications (id, user_id, kind, title, body, action_type, action_transaction_id, dedupe_key, read_at, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      over.user_id ?? USER_ID,
      over.kind ?? 'transaction_auto',
      over.title ?? 'Title',
      over.body ?? 'Body',
      over.action_type === undefined ? 'none' : over.action_type,
      over.action_transaction_id ?? null,
      over.dedupe_key === undefined ? `k:${id}` : over.dedupe_key,
      over.read_at ?? null,
      over.deleted_at ?? null,
      over.created_at ?? '2026-10-04T10:00:00.000Z',
    )
    .run();
  return id;
}

export async function seedJob(over: {
  id?: string;
  user_id?: string;
  kind?: string;
  payload?: unknown;
  status?: string;
  attempts?: number;
  idempotency_key?: string | null;
  result?: unknown;
  created_at?: string;
  updated_at?: string;
}) {
  const id = over.id ?? uid();
  const at = over.created_at ?? '2026-10-04T10:00:00.000Z';
  await testDb()
    .prepare(
      `INSERT INTO jobs (id, user_id, kind, payload, status, attempts, idempotency_key, result, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      over.user_id ?? USER_ID,
      over.kind ?? 'receipt',
      JSON.stringify(over.payload ?? {}),
      over.status ?? 'pending',
      over.attempts ?? 0,
      over.idempotency_key ?? null,
      over.result === undefined ? null : JSON.stringify(over.result),
      at,
      over.updated_at ?? at,
    )
    .run();
  return id;
}

export async function seedPushToken(token: string, userId: string = USER_ID) {
  const now = nowIso();
  await testDb()
    .prepare('INSERT INTO user_push_tokens (id, user_id, expo_push_token, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(uid(), userId, token, 'android', now, now)
    .run();
}

export async function seedEmailSend(over: { user_id?: string; kind: string; period_key: string; status?: string; claimed_at?: string }) {
  await testDb()
    .prepare('INSERT INTO email_sends (id, user_id, kind, period_key, status, claimed_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(uid(), over.user_id ?? USER_ID, over.kind, over.period_key, over.status ?? 'pending', over.claimed_at ?? nowIso())
    .run();
}

/** All rows of a table (optionally filtered), oldest id first, for database-state assertions. */
export async function rowsOf<T = Record<string, unknown>>(table: string, where = '1 = 1', ...params: (string | number | null)[]): Promise<T[]> {
  const { results } = await testDb()
    .prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY rowid`)
    .bind(...params)
    .all<T>();
  return results;
}

export async function oneRow<T = Record<string, unknown>>(table: string, where: string, ...params: (string | number | null)[]): Promise<T | null> {
  return (await rowsOf<T>(table, where, ...params))[0] ?? null;
}

/** The real D1 with one method (`prepare`, `batch`, ...) replaced by a failure, to exercise error paths. */
export function failingDb(method: 'prepare' | 'batch' | 'exec', message = 'D1_ERROR: boom'): D1Database {
  const real = testDb();
  return new Proxy(real, {
    get(target, prop) {
      if (prop === method) {
        return () => {
          throw new Error(message);
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** The real D1, except that statements whose SQL matches `pattern` fail (to exercise error paths of one query). */
export function failingOn(pattern: RegExp, message = 'D1_ERROR: boom'): D1Database {
  const real = testDb();
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql: string) => {
          if (pattern.test(sql)) throw new Error(message);
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** The real D1 plus a log of every prepared SQL string (to count round trips). */
export function spyDb(): { db: D1Database; sqls: string[] } {
  const real = testDb();
  const sqls: string[] = [];
  const db = new Proxy(real, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql: string) => {
          sqls.push(sql);
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  return { db, sqls };
}

/**
 * The real D1, except that right before a statement whose SQL matches `pattern` executes, `hook` runs
 * (to simulate another worker changing the data in between two steps of the code under test).
 * Only `bind(...).first() / .run() / .all()` are supported for matching statements.
 */
export function withBeforeExec(pattern: RegExp, hook: () => Promise<void>): D1Database {
  const real = testDb();
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql: string) => {
          const statement = target.prepare(sql);
          if (!pattern.test(sql)) return statement;
          return {
            bind: (...args: unknown[]) => {
              const bound = statement.bind(...args);
              return {
                first: async <T>(column?: string) => {
                  await hook();
                  return column === undefined ? bound.first<T>() : bound.first<T>(column);
                },
                run: async () => {
                  await hook();
                  return bound.run();
                },
                all: async <T>() => {
                  await hook();
                  return bound.all<T>();
                },
              };
            },
          };
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}
