import { all, batch, first, nowIso, run, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import type { IsoRange } from '../../core/timezone';
import { REPORT_VERSION } from './schemas';
import { historyFromRows } from './snapshot';
import type { CategoryInfo, EarlierMonth, ReportDebit } from './snapshot';

/** IST has no DST, so SQLite can cut IST months with a fixed offset (days are cut in TypeScript with `localDate`). */
const IST_OFFSET = '+330 minutes';
const IST_MONTH = `strftime('%Y-%m', datetime(transaction_at, '${IST_OFFSET}'))`;

export interface MonthData {
  debits: ReportDebit[];
  incomeCents: number;
  categories: Map<string, CategoryInfo>;
  earlier: EarlierMonth[];
}

/**
 * Everything one snapshot needs, in ONE D1 batch: the month's debits, its credit total, the per-category debit totals of
 * the months in `history` (grouped by IST month in SQL) and the categories the user can see.
 */
export async function fetchMonthData(db: Db, userId: string, month: IsoRange, history: IsoRange): Promise<MonthData> {
  const debitWhere = `user_id = ? AND deleted_at IS NULL AND type = 'debit'`;
  const [debitRows, incomeRows, historyRows, categoryRows] = await batch<Record<string, unknown>>(db, [
    stmt(
      db,
      `SELECT amount, transaction_at, payee_key, NULLIF(TRIM(counterparty_name), '') AS name, category_id
       FROM transactions WHERE ${debitWhere} AND transaction_at >= ? AND transaction_at < ?`,
      [userId, month.from, month.to],
    ),
    stmt(
      db,
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE user_id = ? AND deleted_at IS NULL AND type = 'credit' AND transaction_at >= ? AND transaction_at < ?`,
      [userId, month.from, month.to],
    ),
    stmt(
      db,
      `SELECT ${IST_MONTH} AS ym, category_id, SUM(amount) AS total
       FROM transactions WHERE ${debitWhere} AND transaction_at >= ? AND transaction_at < ? GROUP BY ym, category_id`,
      [userId, history.from, history.to],
    ),
    stmt(db, 'SELECT id, name, icon_name, color FROM categories WHERE is_system = 1 OR user_id = ?', [userId]),
  ]);

  return {
    debits: (debitRows ?? []).map((r) => ({
      amountCents: r['amount'] as number,
      at: r['transaction_at'] as string,
      payeeKey: r['payee_key'] as string,
      name: (r['name'] as string | null) ?? null,
      categoryId: (r['category_id'] as string | null) ?? null,
    })),
    incomeCents: ((incomeRows ?? [])[0]?.['total'] as number | undefined) ?? 0,
    categories: new Map(
      (categoryRows ?? []).map((r) => [
        r['id'] as string,
        { name: r['name'] as string, icon_name: (r['icon_name'] as string | null) ?? null, color: (r['color'] as string | null) ?? null },
      ]),
    ),
    earlier: historyFromRows(
      (historyRows ?? []).map((r) => ({ ym: r['ym'] as string, category_id: (r['category_id'] as string | null) ?? null, total: r['total'] as number })),
    ),
  };
}

export interface StoredReport {
  version: number;
  snapshot: string;
  viewed_at: string | null;
}

export async function getStored(db: Db, userId: string, periodKey: string): Promise<StoredReport | null> {
  return first<StoredReport>(db, 'SELECT version, snapshot, viewed_at FROM monthly_reports WHERE user_id = ? AND period_key = ?', [userId, periodKey]);
}

/**
 * Store a snapshot: insert-or-ignore, except that a row of an OLDER snapshot version is replaced (its `viewed_at` stays).
 * Returns the stored JSON when this call wrote it, null when another worker's current-version row won.
 */
export async function saveSnapshot(db: Db, userId: string, periodKey: string, version: number, snapshot: string): Promise<string | null> {
  const row = await first<{ snapshot: string }>(
    db,
    `INSERT INTO monthly_reports (user_id, period_key, version, snapshot, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, period_key) DO UPDATE SET version = excluded.version, snapshot = excluded.snapshot, created_at = excluded.created_at
       WHERE monthly_reports.version < excluded.version
     RETURNING snapshot`,
    [userId, periodKey, version, snapshot, nowIso()],
  );
  return row?.snapshot ?? null;
}

/** Marks the notification step of a stored report as finished (the first time wins). */
export async function markNotified(db: Db, userId: string, periodKey: string): Promise<void> {
  await run(db, 'UPDATE monthly_reports SET notified_at = COALESCE(notified_at, ?) WHERE user_id = ? AND period_key = ?', [nowIso(), userId, periodKey]);
}

/** Sets `viewed_at` once (a later call keeps the first time). False when there is no stored report. */
export async function markViewed(db: Db, userId: string, periodKey: string): Promise<boolean> {
  const row = await first<{ period_key: string }>(
    db,
    `UPDATE monthly_reports SET viewed_at = COALESCE(viewed_at, ?) WHERE user_id = ? AND period_key = ? RETURNING period_key`,
    [nowIso(), userId, periodKey],
  );
  return row !== null;
}

export interface StoredReportRow {
  period_key: string;
  debit_count: number;
  viewed: boolean;
}

/** The user's stored reports with `from <= period_key <= to`, newest first (no snapshot parsing: `debit_count` comes from the JSON in SQL). */
export async function listStored(db: Db, userId: string, from: string, to: string): Promise<StoredReportRow[]> {
  const rows = await all<{ period_key: string; debit_count: number | null; viewed_at: string | null }>(
    db,
    `SELECT period_key, json_extract(snapshot, '$.debit_count') AS debit_count, viewed_at FROM monthly_reports
     WHERE user_id = ? AND period_key >= ? AND period_key <= ? ORDER BY period_key DESC`,
    [userId, from, to],
  );
  return rows.map((r) => ({ period_key: r.period_key, debit_count: r.debit_count ?? 0, viewed: r.viewed_at != null }));
}

const PAGE_SIZE = 1000;

/**
 * Ids of the users who should get the report `periodKey` built: at least `minDebits` non-deleted debits inside `range`
 * and no finished report for that period: no row that is both notified (`notified_at`) and of the current snapshot
 * version. So a catch-up run repairs a missing snapshot, a snapshot whose notification step failed, and a version bump.
 * `report_alerts_enabled` is deliberately not looked at: it gates the notification, not the report (an alerts-off user
 * is marked notified once handled). Stable order, keyset-paged.
 */
export async function* listReportUserPages(db: Db, range: IsoRange, periodKey: string, minDebits: number): AsyncGenerator<string[]> {
  let after = '';
  for (;;) {
    const data = await all<{ id: string }>(
      db,
      `SELECT u.id AS id FROM users u
       WHERE u.id > ?
         AND NOT EXISTS (SELECT 1 FROM monthly_reports r WHERE r.user_id = u.id AND r.period_key = ? AND r.notified_at IS NOT NULL AND r.version >= ?)
         AND (SELECT COUNT(*) FROM (
                SELECT 1 FROM transactions t
                WHERE t.user_id = u.id AND t.deleted_at IS NULL AND t.type = 'debit' AND t.transaction_at >= ? AND t.transaction_at < ?
                LIMIT ?)) >= ?
       ORDER BY u.id ASC LIMIT ?`,
      [after, periodKey, REPORT_VERSION, range.from, range.to, minDebits, minDebits, PAGE_SIZE],
    );
    const ids = data.map((r) => r.id).filter((id) => typeof id === 'string' && id !== '');
    if (ids.length > 0) yield ids;
    if (data.length < PAGE_SIZE) return;
    after = data[data.length - 1]?.id ?? '';
  }
}
