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
};

export type UpdateRecurringBody = Partial<
  Omit<
    CreateRecurringBody,
    "kind" | "post_current_period" | "category_id" | "note"
  >
> & {
  /** `null` clears the category / note. */
  category_id?: string | null;
  note?: string | null;
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
};
