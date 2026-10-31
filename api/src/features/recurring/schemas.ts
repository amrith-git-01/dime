import * as z from 'zod';

import { uuidString } from '../../core/validation';
import { leadDaysOf } from '../reminders/schemas';
import { MAX_LEAD_DAYS } from '../reminders/schedule';
import { amountInput } from '../transactions/schemas';

export const RECURRING_KINDS = ['income', 'subscription'] as const;
export type RecurringKind = (typeof RECURRING_KINDS)[number];
export const CADENCES = ['monthly', 'yearly'] as const;

/** `note`: trimmed, blank becomes null. */
const noteInput = z
  .string()
  .max(2000)
  .nullable()
  .transform((v) => v?.trim() || null);

const nameInput = z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(200));

const fields = {
  name: nameInput,
  amount: amountInput,
  category_id: uuidString.nullish(),
  cadence: z.enum(CADENCES),
  day_of_month: z.number().int().min(1).max(31),
  month_of_year: z.number().int().min(1).max(12).nullish(),
  timezone: z.string().min(2).max(80),
  note: noteInput.optional(),
  /** Days before each due date to remind (1..30: the poster posts the item at 06:00 on the day itself); null / omitted = reminders off. */
  remind_lead_days: leadDaysOf(1, MAX_LEAD_DAYS).nullish(),
};

/** Yearly items need a month (422 `missing`, like a required field). */
function needsMonth(value: { cadence?: string | undefined; month_of_year?: number | null | undefined }, ctx: z.RefinementCtx): void {
  if (value.cadence === 'yearly' && value.month_of_year == null) {
    ctx.addIssue({ code: 'custom', path: ['month_of_year'], message: 'Field required', params: { type: 'missing' } });
  }
}

export const recurringCreateSchema = z
  .object({
    kind: z.enum(RECURRING_KINDS),
    ...fields,
    active: z.boolean().default(true),
    /** When this period's due day has already passed: post it now (true) or wait for the next period (false). */
    post_current_period: z.boolean().default(false),
  })
  .superRefine(needsMonth);
export type RecurringCreateBody = z.output<typeof recurringCreateSchema>;

/** `kind` cannot change; every other field is optional. Cadence/month consistency is checked on the merged item. */
export const recurringPatchSchema = z.object({
  name: fields.name.optional(),
  amount: fields.amount.optional(),
  category_id: fields.category_id,
  cadence: fields.cadence.optional(),
  day_of_month: fields.day_of_month.optional(),
  month_of_year: fields.month_of_year,
  timezone: fields.timezone.optional(),
  note: fields.note,
  active: z.boolean().optional(),
  remind_lead_days: fields.remind_lead_days,
});
export type RecurringPatchBody = z.output<typeof recurringPatchSchema>;

export const recurringListQuerySchema = z.object({ kind: z.enum(RECURRING_KINDS).optional() });
export const recurringMonthQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export const recurringIdParamSchema = z.object({ id: uuidString });

export interface RecurringRow {
  id: string;
  user_id: string;
  kind: RecurringKind;
  name: string;
  /** Integer cents. */
  amount: number;
  category_id: string | null;
  cadence: 'monthly' | 'yearly';
  day_of_month: number;
  month_of_year: number | null;
  timezone: string;
  next_due_date: string;
  active: number;
  note: string | null;
  /** JSON int array of lead days, null = reminders off. */
  remind_lead_days: string | null;
  /** UTC ISO of the next lead-day reminder, null = none. */
  next_remind_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringResponse {
  id: string;
  kind: RecurringKind;
  name: string;
  amount: string;
  category_id: string | null;
  category: string | null;
  category_icon_name: string | null;
  category_color: string | null;
  cadence: 'monthly' | 'yearly';
  day_of_month: number;
  month_of_year: number | null;
  timezone: string;
  next_due_date: string;
  active: boolean;
  note: string | null;
  /** Lead days of the opt-in reminders, null = off. */
  remind_lead_days: number[] | null;
  /** Amount per month as a decimal string: the amount for monthly items, amount / 12 for yearly ones. */
  monthly_equivalent: string;
  created_at: string;
  updated_at: string;
}

/** paid: posted this month; skipped: posted, then deleted by the user; upcoming: active and not posted yet. */
export type OccurrenceStatus = 'paid' | 'skipped' | 'upcoming';

export interface RecurringOccurrence {
  id: string;
  kind: RecurringKind;
  name: string;
  amount: string;
  category: { id: string; name: string; icon_name: string | null; color: string | null; scope: string } | null;
  /** Local due date in the item's timezone, `YYYY-MM-DD`. */
  due_date: string;
  status: OccurrenceStatus;
  /** Paid only: the transaction that was posted and the amount it was posted with. */
  transaction_id?: string;
  posted_amount?: string;
}

export interface RecurringMonthResponse {
  year: number;
  month: number;
  items: RecurringOccurrence[];
  totals: {
    fixed_expense_paid: string;
    fixed_expense_upcoming: string;
    fixed_income_received: string;
    fixed_income_upcoming: string;
  };
}

export interface RecurringListResponse {
  items: RecurringResponse[];
  /** Active items only, over BOTH kinds (not affected by the `kind` filter). */
  summary: { monthly_income_total: string; monthly_subscriptions_total: string };
}
