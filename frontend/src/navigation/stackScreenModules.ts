import type { ComponentType } from "react";

/** Dynamic imports for stack screens — shared by lazy routes and startup preload. */
export const stackScreenModules = {
  settings: () => import("@/screens/settings/SettingsScreen"),
  settingsAccount: () => import("@/screens/settings/SettingsAccountScreen"),
  settingsCapture: () => import("@/screens/settings/SettingsCaptureScreen"),
  settingsFeedback: () => import("@/screens/settings/SettingsFeedbackScreen"),
  notifications: () => import("@/screens/notifications/NotificationsScreen"),
  transactionDetail: () =>
    import("@/screens/transactions/TransactionDetailScreen"),
  createCustomCategory: () =>
    import("@/screens/categories/CreateCustomCategoryScreen"),
  editMonthlyBudget: () => import("@/screens/budget/EditMonthlyBudgetScreen"),
} as const satisfies Record<
  string,
  () => Promise<{ default: ComponentType<object> }>
>;
