import * as z from 'zod';

const bool = z.boolean().nullish();
const pct = z.number().int().min(50).max(95).nullish();

/** Card ids are chosen by the app ("home.upcoming"); the server only checks shape, so new cards need no deploy. */
const cardId = z.string().regex(/^[a-z][a-zA-Z0-9_.-]{0,47}$/);
/** An empty list means "back to the default order" for that screen. */
const cardOrder = z
  .array(cardId)
  .max(30)
  .refine((ids) => new Set(ids).size === ids.length, 'card ids must be unique');

export const CARD_LAYOUT_MAX_BYTES = 4096;

const cardLayouts = z
  .strictObject({ home: cardOrder.optional(), budgets: cardOrder.optional(), insights: cardOrder.optional() })
  .refine((layouts) => JSON.stringify(layouts).length <= CARD_LAYOUT_MAX_BYTES, 'card_layouts is too large');

/** `extra="forbid"` + every field optional/nullable; null means "leave unchanged" like in Python. */
export const settingsPatchSchema = z.strictObject({
  budget_alerts_enabled: bool,
  budget_monthly_alerts_enabled: bool,
  // Removed with the daily budget: still accepted (old app builds send them) but ignored. The columns stay unused
  // in `user_settings` until a later migration drops them.
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
  report_alerts_enabled: bool,
  report_roast_level: z.enum(['gentle', 'spicy', 'savage']).nullish(),
  /** Merged per screen with the stored layouts: patching `home` leaves `budgets` alone. */
  card_layouts: cardLayouts.nullish(),
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
