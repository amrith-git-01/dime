/**
 * `GET /api/v1/forecast` and `POST /api/v1/predictions/feedback` (api/src/features/engine/schemas.ts).
 * Money is a decimal string in rupees; ratios are plain numbers; dates are `YYYY-MM-DD` in the requested timezone.
 */

/** `learning`: under 14 days of history (budget-only); `warming`: 14-29 days (wider ranges); `full`. */
export type ForecastMode = "learning" | "warming" | "full";

export type ForecastLanding = {
  p10: string;
  p50: string;
  p90: string;
  /** The monthly budget; null when none is set. */
  budget: string | null;
  /** Share (0..1) of the simulated months that stay within the budget; null without a budget. */
  chanceUnder: number | null;
  /** Every debit this month so far. */
  spentSoFar: string;
  /** Recurring bills that have not posted yet this month. */
  billsStillDue: string;
  /** The p50 of the flexible spend still to come. */
  flexibleRemaining: string;
};

export type ForecastWeekday = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

export type ForecastSafeToday = {
  /** What can still be spent today within the budget; null without a budget. */
  amount: string | null;
  /** The usual flexible spend on this weekday. */
  usualForWeekday: string;
  weekday: ForecastWeekday;
};

export type ForecastCategoryStatus = "ok" | "hot" | "over";

export type ForecastCategory = {
  /** Category id; null = uncategorized. */
  id: string | null;
  name: string;
  iconName: string | null;
  color: string | null;
  spent: string;
  /** Month-end projection. */
  p50: string;
  budget: string | null;
  /** Usual monthly flexible spend; null without history. */
  baseline: string | null;
  status: ForecastCategoryStatus;
};

export type ForecastUpcomingKind = "bill" | "likely" | "income";

export type ForecastUpcomingItem = {
  id: string;
  kind: ForecastUpcomingKind;
  name: string;
  amount: string;
  date: string;
  payeeKey?: string;
  /** 0..1, likely spends only. */
  confidence?: number;
  categoryId?: string | null;
};

export type ForecastWatchKind = "category_hot" | "unusual" | "subscription_candidate";

export type ForecastWatchItem = {
  id: string;
  kind: ForecastWatchKind;
  text: string;
  categoryId?: string;
  transactionId?: string;
  payeeKey?: string;
  /** subscription_candidate: the payee's display name. */
  name?: string;
  /** subscription_candidate: how often it charges. */
  cadence?: "monthly" | "yearly";
  amount?: string;
  /** subscription_candidate: the day of month (1-31) it usually charges. */
  dayOfMonth?: number;
};

export type ForecastResponse = {
  year: number;
  month: number;
  /** Today in the requested timezone. */
  today: string;
  timezone: string;
  mode: ForecastMode;
  historyDays: number;
  landing: ForecastLanding;
  /** Null for a past month. */
  safeToday: ForecastSafeToday | null;
  categories: ForecastCategory[];
  /** The next 14 days. */
  upcoming: ForecastUpcomingItem[];
  watch: ForecastWatchItem[];
  summary: string;
  /** The previous month's forecast error; null until that month has been scored. */
  accuracy: { lastMonthErrorPct: number } | null;
};

export type ForecastAccuracyResponse = {
  months: { year: number; month: number; errorPct: number; covered: boolean }[];
};

/** What a prediction can be answered about, with the verdicts each kind takes. */
export type FeedbackTargetKind =
  | "payee"
  | "subscription_candidate"
  | "unusual_txn"
  | "category_watch"
  | "payee_merge";

export type FeedbackVerdict = "confirm" | "dismiss" | "one_off" | "not_one_off";

export type PredictionFeedbackInput = {
  targetKind: FeedbackTargetKind;
  targetId: string;
  verdict: FeedbackVerdict;
};

/** Days of history after which the engine is out of its learning stage. */
export const FORECAST_LEARNING_DAYS = 30;

/** What a tap on the Ahead cards does; the screen model decides how (feedback, navigation). */
export type ForecastActions = {
  /** "Yes, usual" on a likely spend. */
  onConfirmLikely: (item: ForecastUpcomingItem) => void;
  /** "Not expected" on a likely spend. */
  onDismissLikely: (item: ForecastUpcomingItem) => void;
  /** "See transactions" on a running-hot category. */
  onSeeCategoryTransactions: (item: ForecastWatchItem) => void;
  /** "Dismiss" on a running-hot category (hidden for this month). */
  onDismissCategoryWatch: (item: ForecastWatchItem) => void;
  /** The unusual-spend card itself: opens the payment. */
  onOpenUnusual: (item: ForecastWatchItem) => void;
  /** "It's a one-off". */
  onMarkOneOff: (item: ForecastWatchItem) => void;
  /** "Not unusual". */
  onMarkNotUnusual: (item: ForecastWatchItem) => void;
  /** "Track as recurring": confirms the subscription and opens the add screen. */
  onTrackRecurring: (item: ForecastWatchItem) => void;
  /** "Not a subscription". */
  onDismissSubscription: (item: ForecastWatchItem) => void;
  /** A row of Categories ahead. */
  onOpenCategory: (category: ForecastCategory) => void;
};
