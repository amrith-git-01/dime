export type ReminderDirection = "pay" | "receive";

export type ReminderCadence = "none" | "weekly" | "monthly" | "yearly";

/** `dismissed` is a reminder that was closed without being paid; the API lists it with `done`. */
export type ReminderStatus = "open" | "done" | "dismissed";

/** Which reminders `GET /api/v1/reminders` returns: `done` means done and dismissed. */
export type ReminderListStatus = "open" | "done" | "all";

/** A transaction that looks like the payment of an open reminder (a suggestion, never a silent close). */
export type ReminderSuggestedMatch = {
  transaction_id: string;
  /** Decimal string. */
  amount: string;
  display_name: string;
  /** `YYYY-MM-DD`, in the reminder's timezone. */
  date: string;
};

/** One reminder of `GET /api/v1/reminders`. Amounts are decimal strings. */
export type Reminder = {
  id: string;
  direction: ReminderDirection;
  title: string;
  amount: string | null;
  counterparty_name: string | null;
  upi_id: string | null;
  /** `YYYY-MM-DD`, a calendar date with no timezone. */
  due_date: string;
  cadence: ReminderCadence;
  /** As stored; null means the user's default list. */
  lead_days: number[] | null;
  /** What actually applies: the stored list, else the user's default. */
  effective_lead_days: number[];
  /** `HH:MM`; null means the user's default time. */
  remind_time: string | null;
  timezone: string;
  status: ReminderStatus;
  completed_at: string | null;
  next_fire_at: string | null;
  suggested_match: ReminderSuggestedMatch | null;
};

export type CreateReminderBody = {
  direction: ReminderDirection;
  title: string;
  due_date: string;
  timezone: string;
  amount?: string;
  counterparty_name?: string;
  upi_id?: string;
  cadence?: ReminderCadence;
  /** Omitted means the user's default lead days. */
  lead_days?: number[];
  /** Omitted means the user's default reminder time. */
  remind_time?: string;
};

/** PATCH is partial; `null` clears the optional fields and restores the default lead days / time. */
export type UpdateReminderBody = {
  direction?: ReminderDirection;
  title?: string;
  due_date?: string;
  timezone?: string;
  amount?: string | null;
  counterparty_name?: string | null;
  upi_id?: string | null;
  cadence?: ReminderCadence;
  lead_days?: number[] | null;
  remind_time?: string | null;
  status?: ReminderStatus;
};

/** Editable fields as typed on the add / edit screen. */
export type ReminderFormState = {
  direction: ReminderDirection;
  amountText: string;
  title: string;
  name: string;
  upiId: string;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  cadence: ReminderCadence;
  /** null follows the user's default list. */
  leadDays: number[] | null;
  /** `HH:MM`; null follows the user's default time. */
  remindTime: string | null;
};
