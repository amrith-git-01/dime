import {
  mergeCardLayouts,
  sanitizeCardLayouts,
  type CardLayouts,
} from "@/features/cardLayout/cardIds";

export const REPORT_ROAST_LEVELS = ["gentle", "spicy", "savage"] as const;
export type ReportRoastLevel = (typeof REPORT_ROAST_LEVELS)[number];

export function isReportRoastLevel(value: unknown): value is ReportRoastLevel {
  return (
    typeof value === "string" &&
    (REPORT_ROAST_LEVELS as readonly string[]).includes(value)
  );
}

/** Longest lead-day list a reminder or the default list may hold. */
export const MAX_REMINDER_LEAD_ENTRIES = 5;
/** The default lead days are 0..27 so they fit every repeat (monthly and yearly reminders allow up to 27). */
export const MAX_DEFAULT_LEAD_DAY = 27;

export type UserSettings = {
  budgetAlertsEnabled: boolean;
  budgetMonthlyAlertsEnabled: boolean;
  budgetCategoryAlertsEnabled: boolean;
  budgetMonthlyWarnPct: number;
  budgetCategoryWarnPct: number;
  autoCaptureAlertsEnabled: boolean;
  captureFailedAlertsEnabled: boolean;
  deviceNotificationsEnabled: boolean;
  dailyExpenseReminderEnabled: boolean;
  dailyExpenseReminderTime: string;
  weeklyEmailEnabled: boolean;
  monthlyEmailEnabled: boolean;
  /** Push / inbox note when the monthly Broke Report is ready. */
  reportAlertsEnabled: boolean;
  /** How hard the Broke Report's copy teases. */
  reportRoastLevel: ReportRoastLevel;
  /** Saved card order per screen (Arrange). A screen without an entry keeps its default order. */
  cardLayouts: CardLayouts;
  /** Push / inbox notes for money reminders. */
  remindersEnabled: boolean;
  /** Days before the due date a reminder fires by default (0 = on the day). May be empty. */
  reminderDefaultLeadDays: number[];
  /** `HH:MM`, the time of day reminders fire. */
  reminderTime: string;
  /** How many "overdue" nudges follow a missed due date (0..5). */
  reminderOverdueNudges: number;
  reminderQuietEnabled: boolean;
  /** `HH:MM`; reminders inside the quiet window wait for its end. */
  reminderQuietStart: string;
  reminderQuietEnd: string;
  /** Hides amounts in reminder notifications only; the app itself still shows them. */
  reminderHideAmounts: boolean;
  /** My UPI ID, for pay links in nudges; null when not set. */
  upiId: string | null;
  /** IANA timezone the device last reported (written at launch); null until then. */
  timezone: string | null;
};

/**
 * Fields to change. `cardLayouts` is merged per screen with the stored ones (patching `home` leaves
 * `budgets` alone) and an empty list for a screen means "back to the default order".
 */
export type UserSettingsPatch = Partial<UserSettings>;

export type FeedbackType = "bug" | "idea" | "enhancement";

export type FeedbackSubmitPayload = {
  type: FeedbackType;
  message: string;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  budgetAlertsEnabled: true,
  budgetMonthlyAlertsEnabled: true,
  budgetCategoryAlertsEnabled: true,
  budgetMonthlyWarnPct: 80,
  budgetCategoryWarnPct: 80,
  autoCaptureAlertsEnabled: true,
  captureFailedAlertsEnabled: true,
  deviceNotificationsEnabled: true,
  dailyExpenseReminderEnabled: true,
  dailyExpenseReminderTime: "20:00",
  weeklyEmailEnabled: true,
  monthlyEmailEnabled: true,
  reportAlertsEnabled: true,
  reportRoastLevel: "spicy",
  cardLayouts: {},
  remindersEnabled: true,
  reminderDefaultLeadDays: [3, 1, 0],
  reminderTime: "09:00",
  reminderOverdueNudges: 2,
  reminderQuietEnabled: false,
  reminderQuietStart: "22:00",
  reminderQuietEnd: "08:00",
  reminderHideAmounts: false,
  upiId: null,
  timezone: null,
};

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

function timeOr(value: unknown, fallback: string): string {
  return typeof value === "string" && HH_MM.test(value) ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Whole days 0..27, no repeats, in the order given; anything else reads as the default list. */
export function sanitizeReminderLeadDays(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_USER_SETTINGS.reminderDefaultLeadDays];
  }
  const days: number[] = [];
  for (const day of value) {
    if (
      typeof day === "number" &&
      Number.isInteger(day) &&
      day >= 0 &&
      day <= MAX_DEFAULT_LEAD_DAY &&
      !days.includes(day)
    ) {
      days.push(day);
    }
  }
  return days.slice(0, MAX_REMINDER_LEAD_ENTRIES);
}

export function normalizeUserSettings(
  partial: Partial<UserSettings> | null | undefined,
): UserSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...partial,
    // Old caches and old servers have neither report field; an unknown level reads as the default.
    reportAlertsEnabled:
      typeof partial?.reportAlertsEnabled === "boolean"
        ? partial.reportAlertsEnabled
        : DEFAULT_USER_SETTINGS.reportAlertsEnabled,
    reportRoastLevel: isReportRoastLevel(partial?.reportRoastLevel)
      ? partial.reportRoastLevel
      : DEFAULT_USER_SETTINGS.reportRoastLevel,
    // Old caches and old servers have no layouts; anything malformed reads as "nothing saved".
    cardLayouts: sanitizeCardLayouts(partial?.cardLayouts),
    // Old caches and old servers have none of the reminder fields; each falls back to its default.
    remindersEnabled: boolOr(
      partial?.remindersEnabled,
      DEFAULT_USER_SETTINGS.remindersEnabled,
    ),
    reminderDefaultLeadDays: sanitizeReminderLeadDays(
      partial?.reminderDefaultLeadDays,
    ),
    reminderTime: timeOr(partial?.reminderTime, DEFAULT_USER_SETTINGS.reminderTime),
    reminderOverdueNudges:
      typeof partial?.reminderOverdueNudges === "number" &&
      Number.isInteger(partial.reminderOverdueNudges) &&
      partial.reminderOverdueNudges >= 0 &&
      partial.reminderOverdueNudges <= 5
        ? partial.reminderOverdueNudges
        : DEFAULT_USER_SETTINGS.reminderOverdueNudges,
    reminderQuietEnabled: boolOr(
      partial?.reminderQuietEnabled,
      DEFAULT_USER_SETTINGS.reminderQuietEnabled,
    ),
    reminderQuietStart: timeOr(
      partial?.reminderQuietStart,
      DEFAULT_USER_SETTINGS.reminderQuietStart,
    ),
    reminderQuietEnd: timeOr(
      partial?.reminderQuietEnd,
      DEFAULT_USER_SETTINGS.reminderQuietEnd,
    ),
    reminderHideAmounts: boolOr(
      partial?.reminderHideAmounts,
      DEFAULT_USER_SETTINGS.reminderHideAmounts,
    ),
    upiId:
      typeof partial?.upiId === "string" && partial.upiId.trim() !== ""
        ? partial.upiId.trim()
        : null,
    timezone:
      typeof partial?.timezone === "string" && partial.timezone.trim() !== ""
        ? partial.timezone
        : null,
  };
}

/** The settings after a patch, the way the server will have them: per-screen merge for `cardLayouts`. */
export function applyUserSettingsPatch(
  settings: UserSettings,
  patch: UserSettingsPatch,
): UserSettings {
  return {
    ...settings,
    ...patch,
    cardLayouts: mergeCardLayouts(settings.cardLayouts, patch.cardLayouts),
  };
}
