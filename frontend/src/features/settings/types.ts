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
};

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
