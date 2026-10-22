import * as z from 'zod';

import type { EngineMode } from './patterns';

/**
 * `GET /api/v1/forecast` (docs/PREDICTIVE-ENGINE-PLAN.md §8.1). Money is a decimal string in rupees ("2890.00"), like
 * every other response; ratios are plain numbers; dates are `YYYY-MM-DD` in the requested timezone.
 */

export interface ForecastLanding {
  p10: string;
  p50: string;
  p90: string;
  /** The monthly budget; null when none is set. */
  budget: string | null;
  /** Share (0..1, two decimals) of the simulated months that stay within the budget; null without a budget. */
  chanceUnder: number | null;
  /** Every debit this month so far (the month summary's debit total). */
  spentSoFar: string;
  /** Recurring bills that have not posted yet this month. */
  billsStillDue: string;
  /** The p50 of the flexible spend still to come (the rest of today and the days after it). */
  flexibleRemaining: string;
}

export interface ForecastSafeToday {
  /** What can still be spent today within the budget; null without a budget. */
  amount: string | null;
  /** The usual flexible spend on this weekday. */
  usualForWeekday: string;
  weekday: 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';
}

export interface ForecastCategory {
  /** Category id; null = uncategorized. */
  id: string | null;
  name: string;
  iconName: string | null;
  color: string | null;
  spent: string;
  /** Month-end projection (the actual total for a past month). */
  p50: string;
  budget: string | null;
  /** Usual monthly flexible spend; null without history. */
  baseline: string | null;
  status: 'ok' | 'hot' | 'over';
}

export interface ForecastUpcomingItem {
  id: string;
  kind: 'bill' | 'likely' | 'income';
  name: string;
  amount: string;
  date: string;
  payeeKey?: string;
  /** 0..1, likely spends only. */
  confidence?: number;
  categoryId?: string | null;
}

export interface ForecastWatchItem {
  id: string;
  kind: 'category_hot' | 'unusual' | 'subscription_candidate';
  text: string;
  categoryId?: string;
  transactionId?: string;
  payeeKey?: string;
  /** subscription_candidate: the payee's display name. */
  name?: string;
  /** subscription_candidate: how often it charges. */
  cadence?: 'monthly' | 'yearly';
  amount?: string;
  /** subscription_candidate: the day of month (1-31) the payee usually charges, from its latest payment. */
  dayOfMonth?: number;
}

export interface ForecastResponse {
  year: number;
  month: number;
  /** Today in the requested timezone. */
  today: string;
  timezone: string;
  /** `learning` (under 14 days of history: budget-only), `warming` (14-30: wider ranges), `full`. */
  mode: EngineMode;
  historyDays: number;
  landing: ForecastLanding;
  /** Null for a past month. */
  safeToday: ForecastSafeToday | null;
  categories: ForecastCategory[];
  /** The next 14 days; empty for a past month. */
  upcoming: ForecastUpcomingItem[];
  watch: ForecastWatchItem[];
  summary: string;
  /** The previous month's forecast error (self-scoring); null until that month has been scored. */
  accuracy: { lastMonthErrorPct: number } | null;
}

/** `GET /api/v1/forecast/accuracy`: the last three scored months, newest first. `errorPct` has one decimal. */
export interface ForecastAccuracyResponse {
  months: Array<{ year: number; month: number; errorPct: number; covered: boolean }>;
}

/** The verdicts each kind of prediction accepts (docs/PREDICTIVE-ENGINE-PLAN.md §6.1). */
export const FEEDBACK_VERDICTS = {
  payee: ['confirm', 'dismiss'],
  subscription_candidate: ['confirm', 'dismiss'],
  unusual_txn: ['one_off', 'not_one_off', 'dismiss'],
  category_watch: ['dismiss'],
  payee_merge: ['dismiss'],
} as const;

export type FeedbackTargetKind = keyof typeof FEEDBACK_VERDICTS;

/** `POST /api/v1/predictions/feedback`. `timezone` (an IANA name) only matters for `category_watch`: it fixes which local month is hidden. */
export const feedbackRequestSchema = z
  .object({
    targetKind: z.enum(['payee', 'subscription_candidate', 'unusual_txn', 'category_watch', 'payee_merge']),
    targetId: z.string().trim().min(1).max(200),
    verdict: z.enum(['confirm', 'dismiss', 'not_one_off', 'one_off']),
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .superRefine((body, ctx) => {
    if (!(FEEDBACK_VERDICTS[body.targetKind] as readonly string[]).includes(body.verdict)) {
      ctx.addIssue({ code: 'custom', path: ['verdict'], message: `A ${body.targetKind} takes ${FEEDBACK_VERDICTS[body.targetKind].join(' or ')}` });
    }
  });
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;
