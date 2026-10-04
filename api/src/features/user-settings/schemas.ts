import * as z from 'zod';

const bool = z.boolean().nullish();
const pct = z.number().int().min(50).max(95).nullish();

/** `extra="forbid"` + every field optional/nullable; null means "leave unchanged" like in Python. */
export const settingsPatchSchema = z.strictObject({
  budget_alerts_enabled: bool,
  budget_monthly_alerts_enabled: bool,
  budget_daily_alerts_enabled: bool,
  budget_category_alerts_enabled: bool,
  budget_monthly_warn_pct: pct,
  budget_daily_warn_pct: pct,
  budget_category_warn_pct: pct,
  auto_capture_alerts_enabled: bool,
  capture_failed_alerts_enabled: bool,
  device_notifications_enabled: bool,
  daily_expense_reminder_enabled: bool,
  daily_expense_reminder_time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .nullish(),
  weekly_email_enabled: bool,
  monthly_email_enabled: bool,
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
