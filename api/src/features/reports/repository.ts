import { all, batch, first, nowIso, run, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import { datesCondition, ledgerSelect, windowFilter } from '../transactions/ledger';
import { REPORT_VERSION } from './schemas';
import { historyFromRows } from './snapshot';
import type { CategoryInfo, EarlierMonth, ReportDebit } from './snapshot';

/** Inclusive local dates (`YYYY-MM-DD`). */
export interface DateRange {
  from: string;
  to: string;
}

export interface MonthData {
  debits: ReportDebit[];
  incomeCents: number;
  categories: Map<string, CategoryInfo>;
  earlier: EarlierMonth[];
}

/**
 * Everything one snapshot needs, in ONE D1 batch, all read through the ledger (`transactions/ledger.ts`): the month's
 * everyday spends (fixed money, transfers and refunds are not "debits"; a spend counts what it really cost), its income, the
 * per-category everyday spend of the months in `history` (grouped by each row's stored month) and the categories the user can see.
 */
export async function fetchMonthData(db: Db, userId: string, month: DateRange, history: DateRange): Promise<MonthData> {
  const inMonth = windowFilter(userId, { dates: month });
  const inHistory = windowFilter(userId, { dates: history });
  const [debitRows, incomeRows, historyRows, categoryRows] = await batch<Record<string, unknown>>(db, [
    stmt(
      db,
      `SELECT l.effective_cents AS amount, l.local_date AS local_date, l.transaction_at AS transaction_at, l.payee_key AS payee_key,
              NULLIF(TRIM(l.counterparty_name), '') AS name, l.category_id AS category_id
       FROM (${ledgerSelect(inMonth.sql)}) l WHERE l.kind = 'spend' AND l.is_fixed = 0 AND l.effective_cents > 0`,
      inMonth.params,
    ),
    stmt(db, `SELECT COALESCE(SUM(l.income_cents), 0) AS total FROM (${ledgerSelect(inMonth.sql)}) l`, inMonth.params),
    stmt(
      db,
      `SELECT l.month_key AS ym, l.category_id AS category_id, MAX(SUM(l.spend_cents), 0) AS total
       FROM (${ledgerSelect(inHistory.sql)}) l WHERE l.is_fixed = 0 GROUP BY l.month_key, l.category_id`,
      inHistory.params,
    ),
    stmt(db, 'SELECT id, name, icon_name, color FROM categories WHERE is_system = 1 OR user_id = ?', [userId]),
  ]);

  return {
    debits: (debitRows ?? []).map((r) => ({
      amountCents: r['amount'] as number,
      at: r['transaction_at'] as string,
      localDate: r['local_date'] as string,
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
 * Ids of the users who should get the report `periodKey` built: at least `minDebits` everyday spends in `month` (inclusive local
 * dates) and no finished report for that period: no row that is both notified (`notified_at`) and of the current snapshot
 * version. So a catch-up run repairs a missing snapshot, a snapshot whose notification step failed, and a version bump.
 * `report_alerts_enabled` is deliberately not looked at: it gates the notification, not the report (an alerts-off user
 * is marked notified once handled). Stable order, keyset-paged.
 */
export async function* listReportUserPages(db: Db, month: DateRange, periodKey: string, minDebits: number): AsyncGenerator<string[]> {
  const onMonth = datesCondition(month, { sql: 'u.id', params: [] });
  let after = '';
  for (;;) {
    const data = await all<{ id: string }>(
      db,
      `SELECT u.id AS id FROM users u
       WHERE u.id > ?
         AND NOT EXISTS (SELECT 1 FROM monthly_reports r WHERE r.user_id = u.id AND r.period_key = ? AND r.notified_at IS NOT NULL AND r.version >= ?)
         AND (SELECT COUNT(*) FROM (
                SELECT 1 FROM transactions t
                WHERE t.user_id = u.id AND t.deleted_at IS NULL AND t.kind = 'spend' AND ${onMonth.sql}
                LIMIT ?)) >= ?
       ORDER BY u.id ASC LIMIT ?`,
      [after, periodKey, REPORT_VERSION, ...onMonth.params, minDebits, minDebits, PAGE_SIZE],
    );
    const ids = data.map((r) => r.id).filter((id) => typeof id === 'string' && id !== '');
    if (ids.length > 0) yield ids;
    if (data.length < PAGE_SIZE) return;
    after = data[data.length - 1]?.id ?? '';
  }
}
