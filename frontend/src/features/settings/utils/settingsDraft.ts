import type { UserSettings, UserSettingsPatch } from "../types";

function sameList(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((day, index) => day === b[index]);
}

/**
 * The settings the screens edit through a draft. `timezone` and `cardLayouts` are not here (launch
 * and Arrange write them), so a draft never sees them.
 */
export const SETTINGS_DRAFT_FIELDS = [
  "budgetMonthlyAlertsEnabled",
  "budgetCategoryAlertsEnabled",
  "budgetMonthlyWarnPct",
  "budgetCategoryWarnPct",
  "autoCaptureAlertsEnabled",
  "captureFailedAlertsEnabled",
  "deviceNotificationsEnabled",
  "dailyExpenseReminderEnabled",
  "dailyExpenseReminderTime",
  "weeklyEmailEnabled",
  "monthlyEmailEnabled",
  "reportAlertsEnabled",
  "reportRoastLevel",
  "remindersEnabled",
  "reminderDefaultLeadDays",
  "reminderTime",
  "reminderOverdueNudges",
  "reminderQuietEnabled",
  "reminderQuietStart",
  "reminderQuietEnd",
  "reminderHideAmounts",
  "upiId",
] as const satisfies readonly (keyof UserSettings)[];

export type SettingsDraftKey = (typeof SETTINGS_DRAFT_FIELDS)[number];

/** Whether one setting holds the same value in both (a lead-day list compares item by item, in order). */
export function sameSettingsField(
  key: SettingsDraftKey,
  a: UserSettings,
  b: UserSettings,
): boolean {
  if (key === "reminderDefaultLeadDays") {
    return sameList(a.reminderDefaultLeadDays, b.reminderDefaultLeadDays);
  }
  return a[key] === b[key];
}

function fieldsOf(keys?: readonly SettingsDraftKey[]): readonly SettingsDraftKey[] {
  return keys ? SETTINGS_DRAFT_FIELDS.filter((key) => keys.includes(key)) : SETTINGS_DRAFT_FIELDS;
}

/**
 * Whether two drafts hold the same editable settings. `keys` limits the check to those settings (a
 * screen that edits one slice); left out, every editable setting counts.
 */
export function settingsEqual(
  a: UserSettings,
  b: UserSettings,
  keys?: readonly SettingsDraftKey[],
): boolean {
  return fieldsOf(keys).every((key) => sameSettingsField(key, a, b));
}

/**
 * Returns only fields that differ from saved, or null if nothing changed. `keys` limits it to those
 * settings; left out, every editable setting is compared.
 */
export function buildSettingsPatch(
  saved: UserSettings,
  draft: UserSettings,
  keys?: readonly SettingsDraftKey[],
): UserSettingsPatch | null {
  const patch: Record<string, unknown> = {};
  for (const key of fieldsOf(keys)) {
    if (!sameSettingsField(key, saved, draft)) {
      patch[key] = draft[key];
    }
  }
  return Object.keys(patch).length > 0 ? (patch as UserSettingsPatch) : null;
}
