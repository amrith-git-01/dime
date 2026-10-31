import * as z from 'zod';

import { parseTimezone } from '../../core/timezone';
import { uuidString } from '../../core/validation';
import { amountInput } from '../transactions/schemas';
import { MAX_LEAD_DAYS, MAX_LEAD_ENTRIES, isCalendarDate } from './schedule';

export const DIRECTIONS = ['pay', 'receive'] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const REMINDER_CADENCES = ['none', 'weekly', 'monthly', 'yearly'] as const;
export const REMINDER_STATUSES = ['open', 'done', 'dismissed'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

/** A UPI id (`name@bank`): what `pa` of a `upi://pay` link carries. */
export const UPI_ID_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,32}$/;

const HM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** `HH:MM` on a 24-hour clock. */
export const hmInput = z.string().regex(HM);

/** Up to 5 unique day counts in `min..max`. */
export const leadDaysOf = (min: number, max: number) =>
  z
    .array(z.number().int().min(min).max(max))
    .max(MAX_LEAD_ENTRIES)
    .refine((days) => new Set(days).size === days.length, 'lead days must be unique');

/** Days before the due date (0 = on the day) of a reminder; the cadence narrows the maximum in the service. */
export const leadDaysInput = leadDaysOf(0, MAX_LEAD_DAYS);

/** An IANA timezone name (a 422, not the service-level 400 of `parseTimezone`). */
export const timezoneInput = z
  .string()
  .min(2)
  .max(80)
  .refine((name) => {
    try {
      parseTimezone(name);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid timezone');

/** Trimmed UPI id; a blank string stays '' (user settings: null means "unchanged", so '' is how a form clears it). */
export const upiOrBlank = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.union([z.literal(''), z.string().regex(UPI_ID_RE)]));

/** Same, with a blank string turned into null (reminders: null clears). */
export const upiInput = upiOrBlank.transform((s) => s || null);

const titleInput = z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(80));
const nameInput = z
  .string()
  .max(200)
  .transform((s) => s.trim() || null);
const dueDateInput = z.string().refine(isCalendarDate, 'Input should be a valid date (YYYY-MM-DD)');

export const reminderCreateSchema = z.object({
  direction: z.enum(DIRECTIONS),
  title: titleInput,
  amount: amountInput.nullish(),
  counterparty_name: nameInput.nullish(),
  upi_id: upiInput.nullish(),
  due_date: dueDateInput,
  cadence: z.enum(REMINDER_CADENCES).default('none'),
  /** Omitted or null = the user's default lead days. */
  lead_days: leadDaysInput.nullish(),
  /** Omitted or null = the user's default reminder time. */
  remind_time: hmInput.nullish(),
  timezone: timezoneInput,
});
export type ReminderCreateBody = z.output<typeof reminderCreateSchema>;

/** Every field optional; `null` clears the nullable ones (amount, name, UPI id) or restores the user default (lead days, time). */
export const reminderPatchSchema = z.object({
  direction: z.enum(DIRECTIONS).optional(),
  title: titleInput.optional(),
  amount: amountInput.nullish(),
  counterparty_name: nameInput.nullish(),
  upi_id: upiInput.nullish(),
  due_date: dueDateInput.optional(),
  cadence: z.enum(REMINDER_CADENCES).optional(),
  lead_days: leadDaysInput.nullish(),
  remind_time: hmInput.nullish(),
  timezone: timezoneInput.optional(),
  status: z.enum(REMINDER_STATUSES).optional(),
});
export type ReminderPatchBody = z.output<typeof reminderPatchSchema>;

export const reminderListQuerySchema = z.object({
  /** `done` = done and dismissed. */
  status: z.enum(['open', 'done', 'all']).default('open'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ReminderListQuery = z.output<typeof reminderListQuerySchema>;

export const reminderIdParamSchema = z.object({ id: uuidString });

export const reminderCompleteSchema = z.object({ transaction_id: uuidString.nullish() });
export type ReminderCompleteBody = z.output<typeof reminderCompleteSchema>;

export interface ReminderRow {
  id: string;
  user_id: string;
  direction: Direction;
  title: string;
  /** Integer cents, null = no amount. */
  amount: number | null;
  counterparty_name: string | null;
  payee_key: string | null;
  upi_id: string | null;
  due_date: string;
  cadence: (typeof REMINDER_CADENCES)[number];
  anchor_day: number;
  /** JSON int array, null = the user's default. */
  lead_days: string | null;
  remind_time: string | null;
  timezone: string;
  status: ReminderStatus;
  completed_at: string | null;
  completed_txn_id: string | null;
  /** JSON array of the (up to 10) latest transactions it was completed with: they are never suggested again. */
  used_txn_ids: string | null;
  fired_through: string | null;
  next_fire_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The transaction that looks like the payment of an open reminder. `date` is its local date in the reminder's timezone. */
export interface SuggestedMatch {
  transaction_id: string;
  amount: string;
  display_name: string;
  date: string;
}

export interface ReminderResponse {
  id: string;
  direction: Direction;
  title: string;
  amount: string | null;
  counterparty_name: string | null;
  upi_id: string | null;
  due_date: string;
  cadence: ReminderRow['cadence'];
  /** As stored (null = the user's default). */
  lead_days: number[] | null;
  /** What actually applies: the stored list, else the user's default. */
  effective_lead_days: number[];
  remind_time: string | null;
  timezone: string;
  status: ReminderStatus;
  completed_at: string | null;
  next_fire_at: string | null;
  suggested_match: SuggestedMatch | null;
}

export interface ReminderListResponse {
  items: ReminderResponse[];
}
