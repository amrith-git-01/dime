import type { UserSettings, UserSettingsPatch } from "../types";

export function settingsEqual(a: UserSettings, b: UserSettings): boolean {
  return (
    a.budgetMonthlyAlertsEnabled === b.budgetMonthlyAlertsEnabled &&
    a.budgetCategoryAlertsEnabled === b.budgetCategoryAlertsEnabled &&
    a.budgetMonthlyWarnPct === b.budgetMonthlyWarnPct &&
    a.budgetCategoryWarnPct === b.budgetCategoryWarnPct &&
    a.autoCaptureAlertsEnabled === b.autoCaptureAlertsEnabled &&
    a.captureFailedAlertsEnabled === b.captureFailedAlertsEnabled &&
    a.deviceNotificationsEnabled === b.deviceNotificationsEnabled &&
    a.dailyExpenseReminderEnabled === b.dailyExpenseReminderEnabled &&
    a.dailyExpenseReminderTime === b.dailyExpenseReminderTime &&
    a.weeklyEmailEnabled === b.weeklyEmailEnabled &&
    a.monthlyEmailEnabled === b.monthlyEmailEnabled &&
    a.reportAlertsEnabled === b.reportAlertsEnabled &&
    a.reportRoastLevel === b.reportRoastLevel
  );
}

/** Returns only fields that differ from saved, or null if nothing changed. */
export function buildSettingsPatch(
  saved: UserSettings,
  draft: UserSettings,
): UserSettingsPatch | null {
  const patch: UserSettingsPatch = {};

  if (draft.budgetMonthlyAlertsEnabled !== saved.budgetMonthlyAlertsEnabled) {
    patch.budgetMonthlyAlertsEnabled = draft.budgetMonthlyAlertsEnabled;
  }
  if (draft.budgetCategoryAlertsEnabled !== saved.budgetCategoryAlertsEnabled) {
    patch.budgetCategoryAlertsEnabled = draft.budgetCategoryAlertsEnabled;
  }
  if (draft.budgetMonthlyWarnPct !== saved.budgetMonthlyWarnPct) {
    patch.budgetMonthlyWarnPct = draft.budgetMonthlyWarnPct;
  }
  if (draft.budgetCategoryWarnPct !== saved.budgetCategoryWarnPct) {
    patch.budgetCategoryWarnPct = draft.budgetCategoryWarnPct;
  }
  if (draft.autoCaptureAlertsEnabled !== saved.autoCaptureAlertsEnabled) {
    patch.autoCaptureAlertsEnabled = draft.autoCaptureAlertsEnabled;
  }
  if (draft.captureFailedAlertsEnabled !== saved.captureFailedAlertsEnabled) {
    patch.captureFailedAlertsEnabled = draft.captureFailedAlertsEnabled;
  }
  if (draft.deviceNotificationsEnabled !== saved.deviceNotificationsEnabled) {
    patch.deviceNotificationsEnabled = draft.deviceNotificationsEnabled;
  }
  if (draft.dailyExpenseReminderEnabled !== saved.dailyExpenseReminderEnabled) {
    patch.dailyExpenseReminderEnabled = draft.dailyExpenseReminderEnabled;
  }
  if (draft.dailyExpenseReminderTime !== saved.dailyExpenseReminderTime) {
    patch.dailyExpenseReminderTime = draft.dailyExpenseReminderTime;
  }
  if (draft.weeklyEmailEnabled !== saved.weeklyEmailEnabled) {
    patch.weeklyEmailEnabled = draft.weeklyEmailEnabled;
  }
  if (draft.monthlyEmailEnabled !== saved.monthlyEmailEnabled) {
    patch.monthlyEmailEnabled = draft.monthlyEmailEnabled;
  }
  if (draft.reportAlertsEnabled !== saved.reportAlertsEnabled) {
    patch.reportAlertsEnabled = draft.reportAlertsEnabled;
  }
  if (draft.reportRoastLevel !== saved.reportRoastLevel) {
    patch.reportRoastLevel = draft.reportRoastLevel;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
