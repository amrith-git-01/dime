import type { UserSettings, UserSettingsPatch } from "../types";

function sameList(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((day, index) => day === b[index]);
}

/**
 * Whether two drafts hold the same editable settings. `timezone` and `cardLayouts` are not edited
 * on the notifications screen (launch and Arrange write them), so they are left out.
 */
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
    a.reportRoastLevel === b.reportRoastLevel &&
    a.remindersEnabled === b.remindersEnabled &&
    sameList(a.reminderDefaultLeadDays, b.reminderDefaultLeadDays) &&
    a.reminderTime === b.reminderTime &&
    a.reminderOverdueNudges === b.reminderOverdueNudges &&
    a.reminderQuietEnabled === b.reminderQuietEnabled &&
    a.reminderQuietStart === b.reminderQuietStart &&
    a.reminderQuietEnd === b.reminderQuietEnd &&
    a.reminderHideAmounts === b.reminderHideAmounts &&
    a.upiId === b.upiId
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
  if (draft.remindersEnabled !== saved.remindersEnabled) {
    patch.remindersEnabled = draft.remindersEnabled;
  }
  if (!sameList(draft.reminderDefaultLeadDays, saved.reminderDefaultLeadDays)) {
    patch.reminderDefaultLeadDays = draft.reminderDefaultLeadDays;
  }
  if (draft.reminderTime !== saved.reminderTime) {
    patch.reminderTime = draft.reminderTime;
  }
  if (draft.reminderOverdueNudges !== saved.reminderOverdueNudges) {
    patch.reminderOverdueNudges = draft.reminderOverdueNudges;
  }
  if (draft.reminderQuietEnabled !== saved.reminderQuietEnabled) {
    patch.reminderQuietEnabled = draft.reminderQuietEnabled;
  }
  if (draft.reminderQuietStart !== saved.reminderQuietStart) {
    patch.reminderQuietStart = draft.reminderQuietStart;
  }
  if (draft.reminderQuietEnd !== saved.reminderQuietEnd) {
    patch.reminderQuietEnd = draft.reminderQuietEnd;
  }
  if (draft.reminderHideAmounts !== saved.reminderHideAmounts) {
    patch.reminderHideAmounts = draft.reminderHideAmounts;
  }
  if (draft.upiId !== saved.upiId) {
    patch.upiId = draft.upiId;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
