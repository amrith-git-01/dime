import type { CounterpartyType } from "./counterpartyTypes";

export type TransactionType = "debit" | "credit";

/**
 * How a row counts: the one field that decides it. `spend` is a debit; `income` and `payback` (a refund or
 * reimbursement) are credits; `transfer` (own accounts, ATM cash, card bills) is either and is in neither
 * spent nor income.
 */
export type TransactionKind = "spend" | "income" | "transfer" | "payback";

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
  /** Catalogue brand this was paid to / received from; null for people and unmatched names. */
  brand_id?: string | null;
  /** Absent from servers and caches that predate the money model; read it with `kindOf`. */
  kind?: TransactionKind;
  /** Sum of the paybacks linked to this row (a debit's reimbursements, or the linked part of a credit). */
  offset_total?: string;
  /** `amount` minus `offset_total`: what is left to count. */
  effective_amount?: string;
  /** A capture the user should look at (possible duplicate, unsure parse). */
  needs_review?: boolean;
  note: string | null;
  detected_via: string | null;
  transaction_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  receipt_url: string | null;
  voice_url: string | null;
};

/** One link between a credit and the debit it pays back (a friend's share of a hotel, a refund). */
export type TransactionOffset = {
  id: string;
  credit_id: string;
  debit_id: string;
  /** Rupees of the credit that pay back the debit, decimal string. */
  amount: string;
  created_at: string;
  /** The other side of the link: the debit when asked about a credit, and the other way round. */
  transaction: TransactionRow;
};

export type TransactionOffsetList = {
  items: TransactionOffset[];
  offset_total: string;
  effective_amount: string;
};

/** A row that could be linked to the one asked about. */
export type PaybackCandidate = {
  transaction: TransactionRow;
  /** What is still unlinked on that row, decimal string. */
  remaining: string;
  /** Same payee as the row asked about. */
  payee_match: boolean;
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

/**
 * The month's budget picture, all from the server's one ledger definition. Every surface (Home, widget, Budgets,
 * Insights) reads these through `resolveMonthBudget`; none re-derives them.
 */
export type MonthBudgetPicture = {
  /** Spend that counts toward the monthly budget (flexible plus recurring items that opted in), net of paybacks. */
  budget_spent?: string;
  /** Signed: negative means over budget. Null when the month has no cap. */
  budget_left?: string | null;
  /** Fixed spend outside the budget (rent, EMI, insurance). */
  committed_total?: string;
  /** Own-account, ATM and card-bill movements: in neither spent nor income. */
  transfer_total?: string;
  /** Money paid back that lowered this month's spend. */
  payback_total?: string;
  /** The cap in force for that month (a past month keeps its own); null when none. */
  monthly_budget?: string | null;
};

export type MonthSummary = MonthBudgetPicture & {
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

export type HomeOverview = MonthBudgetPicture & {
  spent_today: string;
  spent_this_month: string;
  fixed_spent_this_month?: string;
  flexible_spent_this_month?: string;
  top_categories: TopCategoryHome[];
  recent_transactions: TransactionRow[];
  /** Present once home API includes daily spend series. */
  last_7_days_spend?: DailySpendDay[];
};
