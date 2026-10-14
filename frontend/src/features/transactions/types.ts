import type { CounterpartyType } from "./counterpartyTypes";

export type TransactionType = "debit" | "credit";

/** `spend` is everyday money; the `recurring_*` scopes are fixed (rent, salary, subscriptions). */
export type CategoryScope = "spend" | "recurring_expense" | "recurring_income";

export type { CounterpartyType };

export type TransactionRow = {
  id: string;
  user_id: string;
  amount: string;
  type: TransactionType;
  counterparty_name: string | null;
  counterparty_type: CounterpartyType;
  counterparty_normalized: string | null;
  merchant: string;
  category: string | null;
  category_id: string | null;
  category_icon_name: string | null;
  category_color: string | null;
  /** Optional until every API and realtime path sends it; a recurring scope marks fixed money. */
  category_scope?: CategoryScope | null;
  /** The recurring item that posted this row. */
  recurring_item_id?: string | null;
  note: string | null;
  detected_via: string | null;
  transaction_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  receipt_url: string | null;
  voice_url: string | null;
};

export type DayTransactionSummary = {
  date: string;
  credit_total: string;
  debit_total: string;
  /** Part of the day's totals in recurring (fixed) categories. */
  fixed_debit_total?: string;
  fixed_credit_total?: string;
  net: string;
  transaction_count: number;
};

export type TransactionListPage = {
  items: TransactionRow[];
  has_more: boolean;
  /** Per-day totals for the requested range; first page only. */
  day_summaries?: Record<string, DayTransactionSummary>;
};

export type MonthSummary = {
  credit_total: string;
  debit_total: string;
  net: string;
  transaction_count: number;
  /** Fixed = recurring categories (rent, salary, subscriptions); flexible = everything else. */
  fixed_debit_total?: string;
  flexible_debit_total?: string;
  fixed_credit_total?: string;
  flexible_credit_total?: string;
  /** Debit totals keyed by category id; `__uncategorized__` when category is null. */
  debit_by_category: Record<string, string>;
  /** Display fields of the categories in `debit_by_category`, including recurring-scoped ones. */
  category_meta?: MonthSummaryCategoryMeta[];
};

export type MonthSummaryCategoryMeta = {
  id: string;
  name: string;
  icon_name: string | null;
  color: string | null;
  scope?: CategoryScope;
};

export type TopCategoryHome = {
  category_id: string | null;
  name: string;
  icon_name: string | null;
  color: string | null;
  total: string;
};

export type DailySpendDay = {
  date: string;
  total: string;
};

export type HomeOverview = {
  spent_today: string;
  spent_this_month: string;
  fixed_spent_this_month?: string;
  flexible_spent_this_month?: string;
  top_categories: TopCategoryHome[];
  recent_transactions: TransactionRow[];
  /** Present once home API includes daily spend series. */
  last_7_days_spend?: DailySpendDay[];
};
