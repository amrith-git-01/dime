import { sanitizeCardLayouts, type CardLayouts } from "@/features/cardLayout/cardIds";
import { dimeApi } from "@/lib/api/dimeApi";

import {
  isReportRoastLevel,
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
  /** Absent on servers from before the Broke Report. */
  report_alerts_enabled?: boolean;
  report_roast_level?: string;
  /** Absent on servers from before Arrange. */
  card_layouts?: CardLayouts | null;
  /** The reminder fields are absent on servers from before Reminders. */
  reminders_enabled?: boolean;
  reminder_default_lead_days?: number[];
  reminder_time?: string;
  reminder_overdue_nudges?: number;
  reminder_quiet_enabled?: boolean;
  reminder_quiet_start?: string;
  reminder_quiet_end?: string;
  reminder_hide_amounts?: boolean;
  upi_id?: string | null;
  timezone?: string | null;
};

export function mapDto(dto: UserSettingsDto): UserSettings {
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
    reportAlertsEnabled: dto.report_alerts_enabled ?? true,
    reportRoastLevel: isReportRoastLevel(dto.report_roast_level)
      ? dto.report_roast_level
      : "spicy",
    cardLayouts: sanitizeCardLayouts(dto.card_layouts),
    // Missing or malformed values read as the defaults inside `normalizeUserSettings`.
    remindersEnabled: dto.reminders_enabled,
    reminderDefaultLeadDays: dto.reminder_default_lead_days,
    reminderTime: dto.reminder_time,
    reminderOverdueNudges: dto.reminder_overdue_nudges,
    reminderQuietEnabled: dto.reminder_quiet_enabled,
    reminderQuietStart: dto.reminder_quiet_start,
    reminderQuietEnd: dto.reminder_quiet_end,
    reminderHideAmounts: dto.reminder_hide_amounts,
    upiId: dto.upi_id ?? null,
    timezone: dto.timezone ?? null,
  });
}

export function mapPatchToDto(
  patch: UserSettingsPatch,
): Record<string, boolean | number | string | number[] | CardLayouts> {
  const dto: Record<string, boolean | number | string | number[] | CardLayouts> = {};
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
  if (patch.reportAlertsEnabled !== undefined) {
    dto.report_alerts_enabled = patch.reportAlertsEnabled;
  }
  if (patch.reportRoastLevel !== undefined) {
    dto.report_roast_level = patch.reportRoastLevel;
  }
  if (patch.cardLayouts !== undefined) {
    dto.card_layouts = patch.cardLayouts;
  }
  if (patch.remindersEnabled !== undefined) {
    dto.reminders_enabled = patch.remindersEnabled;
  }
  if (patch.reminderDefaultLeadDays !== undefined) {
    dto.reminder_default_lead_days = patch.reminderDefaultLeadDays;
  }
  if (patch.reminderTime !== undefined) {
    dto.reminder_time = patch.reminderTime;
  }
  if (patch.reminderOverdueNudges !== undefined) {
    dto.reminder_overdue_nudges = patch.reminderOverdueNudges;
  }
  if (patch.reminderQuietEnabled !== undefined) {
    dto.reminder_quiet_enabled = patch.reminderQuietEnabled;
  }
  if (patch.reminderQuietStart !== undefined) {
    dto.reminder_quiet_start = patch.reminderQuietStart;
  }
  if (patch.reminderQuietEnd !== undefined) {
    dto.reminder_quiet_end = patch.reminderQuietEnd;
  }
  if (patch.reminderHideAmounts !== undefined) {
    dto.reminder_hide_amounts = patch.reminderHideAmounts;
  }
  // `null` in a PATCH means "unchanged" on the server, so a cleared UPI ID is sent as ''.
  if (patch.upiId !== undefined) {
    dto.upi_id = patch.upiId ?? "";
  }
  if (patch.timezone != null) {
    dto.timezone = patch.timezone;
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
