import { formatCents, toCents } from '../../core/decimal';
import { normalizeCounterparty } from '../transactions/dedupe';
import type { PayeeRow, PayeeSourceRow } from '../transactions/repository';
import type { CounterpartyIncomeRow, CounterpartySpendRow } from './schemas';

const TOP_PAYEES = 4;
const TOP_INCOME_SOURCES = 5;
const OTHER_KEY = '__other__';

/** Same normalization the client uses for payee keys; "unknown" when nothing alphanumeric is left. */
function normalizePayeeKey(raw: string): string {
  return normalizeCounterparty(raw) || 'unknown';
}

function payeeKeyFromRow(row: Pick<PayeeSourceRow, 'counterparty_name' | 'counterparty_normalized'>): string {
  const norm = row.counterparty_normalized;
  if (typeof norm === 'string' && norm.trim()) return norm.trim();
  const name = row.counterparty_name;
  if (typeof name === 'string' && name.trim()) return normalizePayeeKey(name);
  return 'unknown';
}

/**
 * Fallback for the `transactions_payee_totals` RPC: group raw rows (newest first, as fetched) by
 * type and payee key. The display name is the last non-empty name seen, i.e. the oldest row's,
 * exactly like Python's loop; groups keep first-appearance order for tie-breaking.
 */
export function payeeTotalsFromRows(rows: readonly PayeeSourceRow[]): PayeeRow[] {
  const groups = new Map<string, PayeeRow>();
  for (const row of rows) {
    if (row.type !== 'debit' && row.type !== 'credit') continue;
    const key = payeeKeyFromRow(row);
    const id = `${row.type}\u0000${key}`;
    const group = groups.get(id) ?? { type: row.type, payee_key: key, display_name: 'Unknown', total_cents: 0, count: 0 };
    group.total_cents += toCents(row.amount);
    group.count += 1;
    if (typeof row.counterparty_name === 'string' && row.counterparty_name.trim()) group.display_name = row.counterparty_name.trim();
    groups.set(id, group);
  }
  return [...groups.values()];
}

/** `numerator / denominator` rounded half-even to 4 decimals (Python `Decimal.quantize("0.0001")`), as a number. */
export function share(numerator: number, denominator: number): number {
  const n = BigInt(Math.trunc(numerator)) * 10_000n;
  const d = BigInt(Math.trunc(denominator));
  let q = n / d;
  const twice = (n % d) * 2n;
  if (twice > d || (twice === d && q % 2n === 1n)) q += 1n;
  return Number(q) / 10_000;
}

const byTotalDesc = (a: PayeeRow, b: PayeeRow) => b.total_cents - a.total_cents;

/** Top 4 payees by spend plus an "Other" bucket for the rest. */
export function rollUpSpend(debitRows: readonly PayeeRow[], monthDebitCents: number): CounterpartySpendRow[] {
  if (monthDebitCents <= 0) return [];
  const ranked = debitRows.filter((r) => r.type === 'debit').sort(byTotalDesc);
  const result: CounterpartySpendRow[] = ranked.slice(0, TOP_PAYEES).map((r) => ({
    payee_key: r.payee_key,
    display_name: r.display_name,
    debit_total: formatCents(r.total_cents),
    share: share(r.total_cents, monthDebitCents),
    transaction_count: r.count,
  }));
  const rest = ranked.slice(TOP_PAYEES);
  const otherTotal = rest.reduce((sum, r) => sum + r.total_cents, 0);
  if (otherTotal > 0) {
    result.push({
      payee_key: OTHER_KEY,
      display_name: 'Other',
      debit_total: formatCents(otherTotal),
      share: share(otherTotal, monthDebitCents),
      transaction_count: rest.reduce((sum, r) => sum + r.count, 0),
    });
  }
  return result;
}

/** Top 5 income sources by amount. */
export function rollUpIncome(creditRows: readonly PayeeRow[], monthCreditCents: number): CounterpartyIncomeRow[] {
  if (monthCreditCents <= 0) return [];
  return creditRows
    .filter((r) => r.type === 'credit')
    .sort(byTotalDesc)
    .slice(0, TOP_INCOME_SOURCES)
    .map((r) => ({
      payee_key: r.payee_key,
      display_name: r.display_name,
      credit_total: formatCents(r.total_cents),
      share: share(r.total_cents, monthCreditCents),
      transaction_count: r.count,
    }));
}
