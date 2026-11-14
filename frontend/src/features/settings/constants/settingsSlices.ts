import type { SettingsDraftKey } from "../utils/settingsDraft";

/**
 * The settings each screen edits and saves on its own (see `useSettingsDraft`). Module-level lists,
 * so the hook gets the same array every render.
 */
export const DEVICE_NOTIFICATION_KEYS = [
  "deviceNotificationsEnabled",
  "dailyExpenseReminderEnabled",
  "dailyExpenseReminderTime",
  "autoCaptureAlertsEnabled",
  "captureFailedAlertsEnabled",
] as const satisfies readonly SettingsDraftKey[];

export const BUDGET_ALERT_KEYS = [
  "budgetMonthlyAlertsEnabled",
  "budgetMonthlyWarnPct",
  "budgetCategoryAlertsEnabled",
  "budgetCategoryWarnPct",
] as const satisfies readonly SettingsDraftKey[];

export const REMINDER_SETTINGS_KEYS = [
  "remindersEnabled",
  "reminderDefaultLeadDays",
  "reminderTime",
  "reminderOverdueNudges",
  "reminderQuietEnabled",
  "reminderQuietStart",
  "reminderQuietEnd",
  "reminderHideAmounts",
  "upiId",
] as const satisfies readonly SettingsDraftKey[];

export const REPORT_SETTINGS_KEYS = [
  "reportAlertsEnabled",
  "reportRoastLevel",
] as const satisfies readonly SettingsDraftKey[];
