import { formatInrCents } from '../notifications/emitter';
import type { RecurringRow } from '../recurring/schemas';
import type { UserSettings } from '../user-settings/snapshot';
import { dueInstantMs, parseDateKey } from '../recurring/schedule';
import { DEFAULT_REMIND_TIME, leadCap, nextFireMs, parseLeadDays } from './schedule';
import type { QuietHours, ScheduleInput } from './schedule';
import type { Direction, ReminderRow } from './schemas';

/** The reminder preferences the schedule reads (a subset of the user's settings). */
export type PlanSettings = Pick<
  UserSettings,
  'reminder_time' | 'reminder_default_lead_days' | 'reminder_overdue_nudges' | 'reminder_quiet_enabled' | 'reminder_quiet_start' | 'reminder_quiet_end'
>;

const quietOf = (s: PlanSettings): QuietHours | null => (s.reminder_quiet_enabled ? { start: s.reminder_quiet_start, end: s.reminder_quiet_end } : null);

/**
 * Schedule of a reminder's current occurrence: its own lead days / time, else the user's defaults. A lead day beyond what the
 * cadence allows (a default of 20 on a weekly reminder) is ignored rather than failing.
 */
export function reminderInput(row: Pick<ReminderRow, 'due_date' | 'timezone' | 'lead_days' | 'remind_time' | 'cadence'>, s: PlanSettings): ScheduleInput {
  const cap = leadCap(row.cadence);
  return {
    dueDate: row.due_date,
    timezone: row.timezone,
    time: row.remind_time ?? s.reminder_time,
    leadDays: (parseLeadDays(row.lead_days, null) ?? s.reminder_default_lead_days).filter((n) => n <= cap),
    overdueNudges: s.reminder_overdue_nudges,
    quiet: quietOf(s),
  };
}

/**
 * Lead days of a recurring item, the item's timezone, no overdue nudges. `null` = reminders off for the item. The poster posts
 * the item and moves it on at 06:00 local on the due date and overwrites `next_remind_at`, so a step at or after that instant
 * (quiet hours can push an evening step there) could never be sent and is dropped.
 */
export function recurringInput(item: Pick<RecurringRow, 'next_due_date' | 'timezone' | 'remind_lead_days'>, s: PlanSettings): ScheduleInput | null {
  const leadDays = parseLeadDays(item.remind_lead_days, null);
  if (!leadDays) return null;
  return {
    dueDate: item.next_due_date,
    timezone: item.timezone,
    time: s.reminder_time || DEFAULT_REMIND_TIME,
    leadDays,
    overdueNudges: 0,
    quiet: quietOf(s),
    cutoffMs: dueInstantMs(item.timezone, parseDateKey(item.next_due_date)),
  };
}

/** `next_remind_at` of a recurring item: its first lead-day instant after `afterMs` (UTC ISO), or null when off or none is left. */
export function nextRemindIso(item: Pick<RecurringRow, 'next_due_date' | 'timezone' | 'remind_lead_days'>, s: PlanSettings, afterMs: number): string | null {
  const input = recurringInput(item, s);
  const at = input ? nextFireMs(input, afterMs, false) : null;
  return at === null ? null : new Date(at).toISOString();
}

/** First instant of a reminder's schedule after `afterMs` as UTC ISO (null = nothing left). */
export function nextFireIso(input: ScheduleInput, afterMs: number, repeating: boolean): string | null {
  const at = nextFireMs(input, afterMs, repeating);
  return at === null ? null : new Date(at).toISOString();
}

export interface CopyInput {
  direction: Direction;
  title: string;
  /** Who it is paid to / received from. */
  counterparty: string | null;
  amountCents: number | null;
  hideAmounts: boolean;
  /** Whole days from today to the due date (negative = overdue). */
  days: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Fixed English copy of a due reminder (the nudge message tone is client-side only). */
export function reminderCopy(i: CopyInput): { title: string; body: string } {
  const pay = i.direction === 'pay';
  const showAmount = i.amountCents !== null && !i.hideAmounts;
  let title: string;
  if (i.days > 0) title = `${i.title} ${pay ? 'due' : 'expected'} in ${plural(i.days, 'day')}`;
  else if (i.days === 0) title = `${i.title} ${pay ? 'due' : 'expected'} today`;
  else if (pay) title = `${i.title} is ${plural(-i.days, 'day')} overdue`;
  else if (i.counterparty) title = `${i.counterparty}'s ${showAmount ? formatInrCents(i.amountCents as number) : 'payment'} is ${plural(-i.days, 'day')} late`;
  else title = `${i.title} is ${plural(-i.days, 'day')} late`;

  let body: string;
  if (i.amountCents !== null && i.hideAmounts) body = 'Open Dime to see the amount.';
  else if (i.amountCents !== null) {
    const amount = formatInrCents(i.amountCents);
    body = i.counterparty ? `${amount} ${pay ? 'to' : 'from'} ${i.counterparty}` : amount;
  } else if (i.counterparty) body = `${pay ? 'To' : 'From'} ${i.counterparty}`;
  else body = 'Open Dime for details.';
  return { title, body };
}
