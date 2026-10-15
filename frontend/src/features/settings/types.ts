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
};

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
};

export function normalizeUserSettings(
  partial: Partial<UserSettings> | null | undefined,
): UserSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...partial,
  };
}
