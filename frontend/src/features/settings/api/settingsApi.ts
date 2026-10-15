import { dimeApi } from "@/lib/api/dimeApi";

import {
  normalizeUserSettings,
  type UserSettings,
  type UserSettingsPatch,
} from "../types";

type UserSettingsDto = {
  budget_alerts_enabled: boolean;
  budget_monthly_alerts_enabled: boolean;
  budget_category_alerts_enabled: boolean;
  budget_monthly_warn_pct: number;
  budget_category_warn_pct: number;
  auto_capture_alerts_enabled: boolean;
  capture_failed_alerts_enabled: boolean;
  device_notifications_enabled: boolean;
  daily_expense_reminder_enabled: boolean;
  daily_expense_reminder_time: string;
  weekly_email_enabled?: boolean;
  monthly_email_enabled?: boolean;
};

function mapDto(dto: UserSettingsDto): UserSettings {
  return normalizeUserSettings({
    budgetAlertsEnabled: dto.budget_alerts_enabled,
    budgetMonthlyAlertsEnabled: dto.budget_monthly_alerts_enabled,
    budgetCategoryAlertsEnabled: dto.budget_category_alerts_enabled,
    budgetMonthlyWarnPct: dto.budget_monthly_warn_pct,
    budgetCategoryWarnPct: dto.budget_category_warn_pct,
    autoCaptureAlertsEnabled: dto.auto_capture_alerts_enabled,
    captureFailedAlertsEnabled: dto.capture_failed_alerts_enabled,
    deviceNotificationsEnabled: dto.device_notifications_enabled,
    dailyExpenseReminderEnabled: dto.daily_expense_reminder_enabled,
    dailyExpenseReminderTime: dto.daily_expense_reminder_time,
    weeklyEmailEnabled: dto.weekly_email_enabled ?? true,
    monthlyEmailEnabled: dto.monthly_email_enabled ?? true,
  });
}

function mapPatchToDto(
  patch: UserSettingsPatch,
): Record<string, boolean | number | string> {
  const dto: Record<string, boolean | number | string> = {};
  if (patch.budgetAlertsEnabled !== undefined) {
    dto.budget_alerts_enabled = patch.budgetAlertsEnabled;
  }
  if (patch.budgetMonthlyAlertsEnabled !== undefined) {
    dto.budget_monthly_alerts_enabled = patch.budgetMonthlyAlertsEnabled;
  }
  if (patch.budgetCategoryAlertsEnabled !== undefined) {
    dto.budget_category_alerts_enabled = patch.budgetCategoryAlertsEnabled;
  }
  if (patch.budgetMonthlyWarnPct !== undefined) {
    dto.budget_monthly_warn_pct = patch.budgetMonthlyWarnPct;
  }
  if (patch.budgetCategoryWarnPct !== undefined) {
    dto.budget_category_warn_pct = patch.budgetCategoryWarnPct;
  }
  if (patch.autoCaptureAlertsEnabled !== undefined) {
    dto.auto_capture_alerts_enabled = patch.autoCaptureAlertsEnabled;
  }
  if (patch.captureFailedAlertsEnabled !== undefined) {
    dto.capture_failed_alerts_enabled = patch.captureFailedAlertsEnabled;
  }
  if (patch.deviceNotificationsEnabled !== undefined) {
    dto.device_notifications_enabled = patch.deviceNotificationsEnabled;
  }
  if (patch.dailyExpenseReminderEnabled !== undefined) {
    dto.daily_expense_reminder_enabled = patch.dailyExpenseReminderEnabled;
  }
  if (patch.dailyExpenseReminderTime !== undefined) {
    dto.daily_expense_reminder_time = patch.dailyExpenseReminderTime;
  }
  if (patch.weeklyEmailEnabled !== undefined) {
    dto.weekly_email_enabled = patch.weeklyEmailEnabled;
  }
  if (patch.monthlyEmailEnabled !== undefined) {
    dto.monthly_email_enabled = patch.monthlyEmailEnabled;
  }
  return dto;
}

export async function fetchUserSettings(): Promise<UserSettings> {
  const { data } = await dimeApi.get<UserSettingsDto>("/api/v1/me/settings");
  return mapDto(data);
}

export async function patchUserSettings(
  patch: UserSettingsPatch,
): Promise<UserSettings> {
  const { data } = await dimeApi.patch<UserSettingsDto>(
    "/api/v1/me/settings",
    mapPatchToDto(patch),
  );
  return mapDto(data);
}
