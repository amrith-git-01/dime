import type { UserSettings, UserSettingsPatch } from "../types";

export function settingsEqual(a: UserSettings, b: UserSettings): boolean {
  return (
    a.budgetMonthlyAlertsEnabled === b.budgetMonthlyAlertsEnabled &&
    a.budgetDailyAlertsEnabled === b.budgetDailyAlertsEnabled &&
    a.budgetCategoryAlertsEnabled === b.budgetCategoryAlertsEnabled &&
    a.budgetMonthlyWarnPct === b.budgetMonthlyWarnPct &&
    a.budgetDailyWarnPct === b.budgetDailyWarnPct &&
    a.budgetCategoryWarnPct === b.budgetCategoryWarnPct &&
    a.autoCaptureAlertsEnabled === b.autoCaptureAlertsEnabled &&
    a.captureFailedAlertsEnabled === b.captureFailedAlertsEnabled &&
    a.deviceNotificationsEnabled === b.deviceNotificationsEnabled
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
  if (draft.budgetDailyAlertsEnabled !== saved.budgetDailyAlertsEnabled) {
    patch.budgetDailyAlertsEnabled = draft.budgetDailyAlertsEnabled;
  }
  if (draft.budgetCategoryAlertsEnabled !== saved.budgetCategoryAlertsEnabled) {
    patch.budgetCategoryAlertsEnabled = draft.budgetCategoryAlertsEnabled;
  }
  if (draft.budgetMonthlyWarnPct !== saved.budgetMonthlyWarnPct) {
    patch.budgetMonthlyWarnPct = draft.budgetMonthlyWarnPct;
  }
  if (draft.budgetDailyWarnPct !== saved.budgetDailyWarnPct) {
    patch.budgetDailyWarnPct = draft.budgetDailyWarnPct;
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

  return Object.keys(patch).length > 0 ? patch : null;
}
