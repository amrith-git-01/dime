import { dimeApi } from "@/lib/api/dimeApi";

import {
  normalizeUserSettings,
  type UserSettings,
  type UserSettingsPatch,
} from "../types";

type UserSettingsDto = {
  budget_alerts_enabled: boolean;
  budget_monthly_alerts_enabled: boolean;
  budget_daily_alerts_enabled: boolean;
  budget_category_alerts_enabled: boolean;
  budget_monthly_warn_pct: number;
  budget_daily_warn_pct: number;
  budget_category_warn_pct: number;
  auto_capture_alerts_enabled: boolean;
  capture_failed_alerts_enabled: boolean;
  device_notifications_enabled: boolean;
};

function mapDto(dto: UserSettingsDto): UserSettings {
  return normalizeUserSettings({
    budgetAlertsEnabled: dto.budget_alerts_enabled,
    budgetMonthlyAlertsEnabled: dto.budget_monthly_alerts_enabled,
    budgetDailyAlertsEnabled: dto.budget_daily_alerts_enabled,
    budgetCategoryAlertsEnabled: dto.budget_category_alerts_enabled,
    budgetMonthlyWarnPct: dto.budget_monthly_warn_pct,
    budgetDailyWarnPct: dto.budget_daily_warn_pct,
    budgetCategoryWarnPct: dto.budget_category_warn_pct,
    autoCaptureAlertsEnabled: dto.auto_capture_alerts_enabled,
    captureFailedAlertsEnabled: dto.capture_failed_alerts_enabled,
    deviceNotificationsEnabled: dto.device_notifications_enabled,
  });
}

function mapPatchToDto(
  patch: UserSettingsPatch,
): Record<string, boolean | number> {
  const dto: Record<string, boolean | number> = {};
  if (patch.budgetAlertsEnabled !== undefined) {
    dto.budget_alerts_enabled = patch.budgetAlertsEnabled;
  }
  if (patch.budgetMonthlyAlertsEnabled !== undefined) {
    dto.budget_monthly_alerts_enabled = patch.budgetMonthlyAlertsEnabled;
  }
  if (patch.budgetDailyAlertsEnabled !== undefined) {
    dto.budget_daily_alerts_enabled = patch.budgetDailyAlertsEnabled;
  }
  if (patch.budgetCategoryAlertsEnabled !== undefined) {
    dto.budget_category_alerts_enabled = patch.budgetCategoryAlertsEnabled;
  }
  if (patch.budgetMonthlyWarnPct !== undefined) {
    dto.budget_monthly_warn_pct = patch.budgetMonthlyWarnPct;
  }
  if (patch.budgetDailyWarnPct !== undefined) {
    dto.budget_daily_warn_pct = patch.budgetDailyWarnPct;
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
