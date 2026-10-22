import { localDate } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';
import type { RecurringRow } from '../recurring/schemas';
import { normalizeCounterparty } from '../transactions/dedupe';
import { MIN_CONFIDENCE, confidenceOf } from './confidence';
import { categoryHotText, categoryOverText, inr, inrCompact, subscriptionCandidateText, unusualRatio, unusualText, wholeRupees } from './copy';
import type { CopyTarget } from './copy';
import type { CategoryOutlook } from './forecast';
import { dateN, dayNumber, mad, median } from './math';
import { isFlexibleSpend } from './patterns';
import type { EngineTxRow, PayeePatternRow } from './types';

/** Robust z-score from which a spend is flagged, and the fewest past samples to judge it by. */
export const UNUSUAL_Z = 3.5;
export const UNUSUAL_MIN_SAMPLES = 5;
/** A flagged spend stays on the list this many days. */
const UNUSUAL_DAYS = 7;
const MAX_PER_KIND = 3;
/** Scales a MAD to a standard deviation for normal data. */
const MAD_TO_SIGMA = 1.4826;

export interface WatchItem {
  /** Stable across requests, so the app can key and dismiss it. */
  id: string;
  kind: 'category_hot' | 'unusual' | 'subscription_candidate';
  /** Template copy (P3 replaces it with model-written text). */
  text: string;
  categoryId?: string;
  transactionId?: string;
  payeeKey?: string;
  /** subscription_candidate: the payee's display name. */
  name?: string;
  /** subscription_candidate: how often it charges. */
  cadence?: 'monthly' | 'yearly';
  /** Paise: the projection, the spend, or the subscription's amount (whole rupees). */
  amount?: number;
  /** subscription_candidate: the user-local day of month (1-31) of the payee's latest payment. */
  dayOfMonth?: number;
  /** What the labeller may rewrite: the card's placeholders with their formatted values. Not part of the response. */
  copy: Pick<CopyTarget, 'variant' | 'label' | 'values'>;
}

export interface WatchInput {
  tz: string;
  today: LocalDate;
  mode: 'learning' | 'warming' | 'full';
  /** This month's categories with their outlook and name. */
  categories: ReadonlyArray<CategoryOutlook & { name: string }>;
  /** Loaded transactions of the last 120 days. */
  rows: readonly EngineTxRow[];
  /** ISO instant the month starts at. */
  monthFrom: string;
  /** Active patterns (`count_120d > 0`, not suppressed). */
  patterns: readonly PayeePatternRow[];
  /** The user's recurring items: a subscription that matches one is already tracked. */
  recurring: readonly RecurringRow[];
  /** `prediction_feedback` dismissals as `<target_kind>:<target_id>`. */
  dismissed: ReadonlySet<string>;
}

const payeeName = (row: EngineTxRow) => row.counterparty_name?.trim() || row.payee_key;

/** The payee that makes up most of a category's flexible spend this month. */
function topDriver(rows: readonly EngineTxRow[], categoryId: string, monthFrom: string): { name: string; amount: number } | null {
  const byPayee = new Map<string, { name: string; amount: number }>();
  for (const row of rows) {
    if (row.transaction_at < monthFrom || row.category_id?.toLowerCase() !== categoryId || !isFlexibleSpend(row)) continue;
    const hit = byPayee.get(row.payee_key);
    if (hit) hit.amount += row.amount;
    else byPayee.set(row.payee_key, { name: payeeName(row), amount: row.amount });
  }
  return [...byPayee.values()].sort((a, b) => b.amount - a.amount)[0] ?? null;
}

function hotCategories(input: WatchInput): WatchItem[] {
  return input.categories
    .filter((c) => c.id !== null && c.status !== 'ok' && !input.dismissed.has(`category_watch:${c.id}`))
    .map((c) => ({ c, over: c.status === 'over', excess: c.p50 - (c.status === 'over' ? (c.budget as number) : (c.baseline as number)) }))
    .sort((a, b) => Number(b.over) - Number(a.over) || b.excess - a.excess)
    .slice(0, MAX_PER_KIND)
    .map(({ c, over }) => {
      const id = c.id as string;
      const driver = topDriver(input.rows, id, input.monthFrom);
      const text = over
        ? categoryOverText({ category: c.name, p50: c.p50, budget: c.budget as number, driver })
        : categoryHotText({ category: c.name, p50: c.p50, baseline: c.baseline as number, driver });
      const values: Record<string, string> = {
        category: c.name,
        projected: inrCompact(c.p50),
        ...(over ? { budget: inrCompact(c.budget as number) } : { usual: inrCompact(c.baseline as number) }),
        ...(driver ? { payee: driver.name, payeeAmount: inrCompact(driver.amount) } : {}),
      };
      return { id: `hot:${id}`, kind: 'category_hot', text, categoryId: id, amount: c.p50, copy: { variant: over ? 'over' : 'hot', label: c.name, values } };
    });
}

/** Debits of the last week that are far above what the user pays that payee (or, for a new payee, that category). */
function unusualSpends(input: WatchInput): WatchItem[] {
  const { tz } = input;
  const todayN = dateN(input.today);
  const flexible = input.rows.filter(isFlexibleSpend);
  const found: Array<{ row: EngineTxRow; z: number; usual: number; basis: 'payee' | 'category' }> = [];
  for (const row of flexible) {
    const ago = todayN - dayNumber(tz, Date.parse(row.transaction_at));
    if (ago < 0 || ago >= UNUSUAL_DAYS || input.dismissed.has(`unusual_txn:${row.id}`)) continue;
    const before = (other: EngineTxRow) => other.id !== row.id && other.transaction_at < row.transaction_at;
    let samples = flexible.filter((o) => before(o) && o.payee_key === row.payee_key);
    let basis: 'payee' | 'category' = 'payee';
    if (samples.length < UNUSUAL_MIN_SAMPLES && row.category_id) {
      samples = flexible.filter((o) => before(o) && o.category_id === row.category_id);
      basis = 'category';
    }
    if (samples.length < UNUSUAL_MIN_SAMPLES) continue;
    const amounts = samples.map((o) => o.amount);
    const usual = median(amounts);
    const spread = mad(amounts);
    if (spread === 0) continue; // every past amount is the same: no scale to judge by
    const z = (row.amount - usual) / (MAD_TO_SIGMA * spread);
    if (z >= UNUSUAL_Z) found.push({ row, z, usual, basis });
  }
  return found
    .sort((a, b) => b.z - a.z)
    .slice(0, MAX_PER_KIND)
    .map(({ row, usual, basis }) => {
      // The category's name, for a payee compared with its category ("your usual Shopping spend").
      const category = basis === 'category' ? input.categories.find((c) => c.id === row.category_id?.toLowerCase())?.name : undefined;
      return {
        id: `unusual:${row.id}`,
        kind: 'unusual' as const,
        text: unusualText({ amount: row.amount, payee: payeeName(row), usual, basis, category }),
        transactionId: row.id,
        payeeKey: row.payee_key,
        amount: row.amount,
        copy: {
          // A category comparison reads differently ("your usual Shopping spend", not "your usual there"), so it is its own variant.
          variant: basis === 'category' ? 'unusual_category' : 'unusual',
          label: payeeName(row),
          values: {
            amount: inr(row.amount),
            payee: payeeName(row),
            usual: inr(usual),
            times: `${unusualRatio(row.amount, usual)}x`,
            ...(category ? { category } : {}),
          },
        },
      };
    });
}

/** Payees that look like a subscription but are not tracked as a recurring item. */
function subscriptionCandidates(input: WatchInput): WatchItem[] {
  // Tracked: one of its rows came from a recurring item, or an active subscription item is named like the payee.
  const tracked = new Set(input.rows.filter((r) => r.recurring_item_id !== null).map((r) => r.payee_key));
  for (const r of input.recurring) if (r.active === 1 && r.kind === 'subscription') tracked.add(normalizeCounterparty(r.name));
  return input.patterns
    .filter(
      (p) =>
        p.kind === 'subscription' &&
        p.count_120d > 0 &&
        p.suppressed === 0 &&
        confidenceOf(p.alpha, p.beta) >= MIN_CONFIDENCE &&
        !tracked.has(p.payee_key) &&
        !input.dismissed.has(`subscription_candidate:${p.payee_key}`),
    )
    .sort((a, b) => b.median_amount - a.median_amount)
    .slice(0, MAX_PER_KIND)
    .map((p) => {
      const yearly = (p.median_interval_days ?? 0) > 100;
      const period = yearly ? 'yearly' : 'monthly';
      const amount = wholeRupees(p.median_amount);
      return {
        id: `sub:${p.payee_key}`,
        kind: 'subscription_candidate' as const,
        text: subscriptionCandidateText({ name: p.display_name, amount, yearly }),
        payeeKey: p.payee_key,
        name: p.display_name,
        cadence: period,
        amount,
        dayOfMonth: localDate(input.tz, Date.parse(p.last_at)).day,
        copy: { variant: period, label: p.display_name, values: { payee: p.display_name, amount: inr(amount), period } },
      };
    });
}

/**
 * What to keep an eye on (docs/PREDICTIVE-ENGINE-PLAN.md §5.5): categories running hot or over budget, unusual spends of
 * the last week, and subscriptions that are not tracked yet. Anything the user dismissed stays off. Under 14 days of
 * history there are no unusual flags or subscription suggestions.
 */
export function buildWatch(input: WatchInput): WatchItem[] {
  const hot = hotCategories(input);
  if (input.mode === 'learning') return hot;
  return [...hot, ...unusualSpends(input), ...subscriptionCandidates(input)];
}
