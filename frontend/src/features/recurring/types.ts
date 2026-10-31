export type RecurringKind = "income" | "subscription";

export type RecurringCadence = "monthly" | "yearly";

/** One row of `GET /api/v1/recurring`. Amounts are decimal strings. */
export type RecurringItem = {
  id: string;
  kind: RecurringKind;
  name: string;
  amount: string;
  category_id: string | null;
  category: string | null;
  category_icon_name: string | null;
  category_color: string | null;
  cadence: RecurringCadence;
  day_of_month: number;
  month_of_year: number | null;
  timezone: string;
  /** `YYYY-MM-DD`, a calendar date with no timezone. */
  next_due_date: string;
  active: boolean;
  note: string | null;
  /** Days before the due date a reminder is sent (1..30); null or absent means off. */
  remind_lead_days?: number[] | null;
  monthly_equivalent: string;
  created_at: string;
  updated_at: string;
};

export type RecurringSummary = {
  monthly_income_total: string;
  monthly_subscriptions_total: string;
};

export type RecurringListResponse = {
  items: RecurringItem[];
  summary: RecurringSummary;
};

export type CreateRecurringBody = {
  kind: RecurringKind;
  name: string;
  amount: string;
  category_id?: string;
  cadence: RecurringCadence;
  day_of_month: number;
  month_of_year?: number;
  timezone: string;
  note?: string;
  active?: boolean;
  post_current_period?: boolean;
  /** Omitted means no reminder. */
  remind_lead_days?: number[];
};

export type UpdateRecurringBody = Partial<
  Omit<
    CreateRecurringBody,
    "kind" | "post_current_period" | "category_id" | "note" | "remind_lead_days"
  >
> & {
  /** `null` clears the category / note. */
  category_id?: string | null;
  note?: string | null;
  /** `null` turns the reminder off. */
  remind_lead_days?: number[] | null;
};

/** Editable fields as typed on the add/edit screen. */
export type RecurringFormState = {
  name: string;
  amountText: string;
  cadence: RecurringCadence;
  dayOfMonthText: string;
  monthOfYear: number;
  categoryId: string | null;
  note: string;
  active: boolean;
  postCurrentPeriod: boolean;
  /** Days before the due date to be reminded; empty means no reminder. */
  remindLeadDays: number[];
};

/** paid: posted this month; skipped: posted, then deleted; upcoming: active and not posted yet. */
export type RecurringOccurrenceStatus = "paid" | "skipped" | "upcoming";

/** One recurring item's occurrence in a calendar month (`GET /api/v1/recurring/month`). */
export type RecurringOccurrence = {
  id: string;
  kind: RecurringKind;
  name: string;
  amount: string;
  category: {
    id: string;
    name: string;
    icon_name: string | null;
    color: string | null;
    scope: string;
  } | null;
  /** `YYYY-MM-DD`, a calendar date with no timezone. */
  due_date: string;
  status: RecurringOccurrenceStatus;
  transaction_id?: string;
  /** Paid only: the amount that was actually posted. */
  posted_amount?: string;
};

export type RecurringMonthTotals = {
  fixed_expense_paid: string;
  fixed_expense_upcoming: string;
  fixed_income_received: string;
  fixed_income_upcoming: string;
};

export type RecurringMonthResponse = {
  year: number;
  /** 1-12. */
  month: number;
  items: RecurringOccurrence[];
  totals: RecurringMonthTotals;
};
