import { addDays, dateKey, localDate } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';
import { nextAfter, parseDateKey } from '../recurring/schedule';
import type { RecurringKind, RecurringRow } from '../recurring/schemas';
import { normalizeCounterparty } from '../transactions/dedupe';
import { LIKELY_CONFIDENCE, MIN_CONFIDENCE, confidenceOf } from './confidence';
import { dateN, dayNumber } from './math';
import type { EngineTxRow, PayeePatternRow } from './types';

/** How far ahead "Coming up" looks, today included. */
export const UPCOMING_DAYS = 14;
/** A likely spend this many days past its expected date still shows (as today); older ones are dropped. */
const OVERDUE_GRACE_DAYS = 2;
/** A pattern's income this close to a recurring income's date (and amount) is the same pay day. */
const SAME_INCOME_DAYS = 3;
const SAME_INCOME_AMOUNT = 0.2;

export interface UpcomingItem {
  /** Stable across requests, so the app can key and dismiss it. */
  id: string;
  kind: 'bill' | 'likely' | 'income';
  name: string;
  /** Paise. */
  amount: number;
  /** `YYYY-MM-DD` in the user's timezone. */
  date: string;
  payeeKey?: string;
  /** 0..1, likely spends only. */
  confidence?: number;
  categoryId?: string | null;
}

export interface RecurringOccurrence {
  item: RecurringRow;
  /** `YYYY-MM-DD`; a due date already in the past (not posted yet) counts as `fromKey`. */
  date: string;
}

/**
 * Every due date of the active recurring items of `kind` in `[fromKey, toKey]`: the item's `next_due_date`, then the
 * following periods (a yearly item shows once, a monthly one once per month). `next_due_date` is the next unposted date.
 * An item that is overdue (not posted yet) counts once, on `fromKey`, however many periods it missed.
 */
export function recurringOccurrences(items: readonly RecurringRow[], kind: RecurringKind, fromKey: string, toKey: string): RecurringOccurrence[] {
  const out: RecurringOccurrence[] = [];
  for (const item of items) {
    if (item.active !== 1 || item.kind !== kind) continue;
    let due = parseDateKey(item.next_due_date);
    let overdue = false;
    for (let step = 0; step < 64 && dateKey(due) <= toKey; step++) {
      const key = dateKey(due);
      if (key >= fromKey) out.push({ item, date: key });
      else if (!overdue) {
        overdue = true;
        out.push({ item, date: fromKey });
      }
      due = nextAfter(item, due);
    }
  }
  return out;
}

export interface BillsDue {
  /** Paise. */
  total: number;
  /** Paise by category id (items without a category are left out of the map). */
  byCategory: Map<string, number>;
}

/** Subscriptions that still post between today and the end of the month. */
export function billsStillDue(items: readonly RecurringRow[], todayKey: string, monthEndKey: string): BillsDue {
  const out: BillsDue = { total: 0, byCategory: new Map() };
  for (const { item } of recurringOccurrences(items, 'subscription', todayKey, monthEndKey)) {
    out.total += item.amount;
    if (item.category_id) {
      const key = item.category_id.toLowerCase();
      out.byCategory.set(key, (out.byCategory.get(key) ?? 0) + item.amount);
    }
  }
  return out;
}

export interface UpcomingInput {
  today: LocalDate;
  tz: string;
  recurring: readonly RecurringRow[];
  /** Active patterns (`count_120d > 0`, not suppressed). */
  patterns: readonly PayeePatternRow[];
  /** The loaded transactions, to tell a likely spend that already happened today. */
  rows: readonly EngineTxRow[];
  /** `prediction_feedback` dismissals as `<target_kind>:<target_id>`. */
  dismissed: ReadonlySet<string>;
  /** Learning mode (under 14 days of history) has no likely spends. */
  learning: boolean;
}

const KIND_ORDER = { bill: 0, income: 1, likely: 2 } as const;

/** Day number of a `YYYY-MM-DD` key. */
const keyN = (key: string) => dateN(parseDateKey(key));


/**
 * The next 14 days (docs/PREDICTIVE-ENGINE-PLAN.md §5.4, §8.1): recurring bills and income, income that repeats without
 * being tracked as a recurring item, and the habits that are due. Sorted by date, then bills, income, likely spends.
 */
export function buildUpcoming(input: UpcomingInput): UpcomingItem[] {
  const { today, tz } = input;
  const fromKey = dateKey(today);
  const toKey = dateKey(addDays(today, UPCOMING_DAYS - 1));
  const items: UpcomingItem[] = [];

  for (const { item, date } of recurringOccurrences(input.recurring, 'subscription', fromKey, toKey)) {
    items.push({ id: `bill:${item.id}:${date}`, kind: 'bill', name: item.name, amount: item.amount, date, categoryId: item.category_id });
  }
  const incomes = recurringOccurrences(input.recurring, 'income', fromKey, toKey);
  for (const { item, date } of incomes) {
    items.push({ id: `income:${item.id}:${date}`, kind: 'income', name: item.name, amount: item.amount, date });
  }

  const todayN = keyN(fromKey);
  const trackedIncome = input.recurring.filter((r) => r.kind === 'income' && r.active === 1);
  // Where a pattern expects its next transaction: its date, or today when it is a little late; null = out of range.
  const shownDate = (p: PayeePatternRow): string | null => {
    if (!p.next_expected_at) return null;
    const ms = Date.parse(p.next_expected_at);
    if (Number.isNaN(ms)) return null;
    const lateBy = todayN - dayNumber(tz, ms);
    if (lateBy > OVERDUE_GRACE_DAYS) return null;
    const key = lateBy > 0 ? fromKey : dateKey(localDate(tz, ms));
    return key <= toKey ? key : null;
  };
  const doneToday = (payeeKey: string, date: string) =>
    date === fromKey && input.rows.some((r) => r.type === 'debit' && r.payee_key === payeeKey && dateKey(localDate(tz, Date.parse(r.transaction_at))) >= date);

  for (const p of input.patterns) {
    if (p.count_120d <= 0 || p.suppressed === 1 || input.dismissed.has(`payee:${p.payee_key}`)) continue;
    const confidence = confidenceOf(p.alpha, p.beta);
    if (confidence < MIN_CONFIDENCE) continue;
    const date = shownDate(p);
    if (!date) continue;
    if (p.kind === 'habit') {
      if (input.learning || confidence < LIKELY_CONFIDENCE || doneToday(p.payee_key, date)) continue;
      items.push({
        id: `likely:${p.payee_key}`,
        kind: 'likely',
        name: p.display_name,
        amount: p.median_amount,
        date,
        payeeKey: p.payee_key,
        confidence: Math.round(confidence * 100) / 100,
        categoryId: p.category_id,
      });
    } else if (p.kind === 'income') {
      // An income already tracked as a recurring item shows from that item.
      const tracked =
        incomes.some(
          (o) => Math.abs(keyN(date) - keyN(o.date)) <= SAME_INCOME_DAYS && Math.abs(o.item.amount - p.median_amount) <= SAME_INCOME_AMOUNT * o.item.amount,
        ) || trackedIncome.some((r) => normalizeCounterparty(r.name) === p.payee_key);
      if (tracked) continue;
      items.push({ id: `income:${p.payee_key}`, kind: 'income', name: p.display_name, amount: p.median_amount, date, payeeKey: p.payee_key });
    }
  }

  return items.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.kind !== b.kind ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind] : a.name.localeCompare(b.name)));
}
