import { parseLeadDays } from '../reminders/schedule';

export const CARD_SCREENS = ['home', 'budgets', 'insights'] as const;
export type CardScreen = (typeof CARD_SCREENS)[number];
/** Saved card order per screen; a screen without a key keeps its default order. */
export type CardLayouts = Partial<Record<CardScreen, string[]>>;

/** Stored JSON -> layouts. Corrupt or foreign JSON reads as "nothing saved" instead of failing the settings read. */
export function parseCardLayouts(raw: unknown): CardLayouts {
  if (typeof raw !== 'string' || raw === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const out: CardLayouts = {};
  for (const screen of CARD_SCREENS) {
    const ids = (parsed as Record<string, unknown>)[screen];
    if (Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === 'string')) out[screen] = ids;
  }
  return out;
}

export const ROAST_LEVELS = ['gentle', 'spicy', 'savage'] as const;
export type RoastLevel = (typeof ROAST_LEVELS)[number];

/** Typed view of a `user_settings` row with Python's defaults and clamping (UserSettingsSnapshot). */
export interface UserSettings {
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
  weekly_email_enabled: boolean;
  monthly_email_enabled: boolean;
  report_alerts_enabled: boolean;
  report_roast_level: RoastLevel;
  card_layouts: CardLayouts;
  /** Money reminders (features/reminders). The lead-days list is stored as JSON text. */
  reminders_enabled: boolean;
  reminder_default_lead_days: number[];
  reminder_time: string;
  reminder_overdue_nudges: number;
  reminder_quiet_enabled: boolean;
  reminder_quiet_start: string;
  reminder_quiet_end: string;
  reminder_hide_amounts: boolean;
  /** The user's own UPI id (for "pay me" links); null = none. */
  upi_id: string | null;
  /** IANA timezone written by the app; null until it has. */
  timezone: string | null;
}

export const DEFAULT_SETTINGS: UserSettings = {
  budget_alerts_enabled: true,
  budget_monthly_alerts_enabled: true,
  budget_category_alerts_enabled: true,
  budget_monthly_warn_pct: 80,
  budget_category_warn_pct: 80,
  auto_capture_alerts_enabled: true,
  capture_failed_alerts_enabled: true,
  device_notifications_enabled: true,
  daily_expense_reminder_enabled: true,
  daily_expense_reminder_time: '20:00',
  weekly_email_enabled: true,
  monthly_email_enabled: true,
  report_alerts_enabled: true,
  report_roast_level: 'spicy',
  card_layouts: {},
  reminders_enabled: true,
  reminder_default_lead_days: [3, 1, 0],
  reminder_time: '09:00',
  reminder_overdue_nudges: 2,
  reminder_quiet_enabled: false,
  reminder_quiet_start: '22:00',
  reminder_quiet_end: '08:00',
  reminder_hide_amounts: false,
  upi_id: null,
  timezone: null,
};

export const SETTINGS_COLUMNS = Object.keys(DEFAULT_SETTINGS).join(',');

function clampPct(value: unknown, fallback = 80): number {
  const n = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(50, Math.min(95, n));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

/** `HH:MM` as stored, or the fallback for anything else. */
const hm = (value: unknown, fallback: string): string => (typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback);

/** Build settings from a (possibly partial) row; absent keys get the default. */
export function settingsFromRow(row: Record<string, unknown> | null | undefined): UserSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  const bool = (k: keyof UserSettings) => (k in row ? Boolean(row[k]) : (DEFAULT_SETTINGS[k] as boolean));
  const time = row['daily_expense_reminder_time'];
  return {
    budget_alerts_enabled: bool('budget_alerts_enabled'),
    budget_monthly_alerts_enabled: bool('budget_monthly_alerts_enabled'),
    budget_category_alerts_enabled: bool('budget_category_alerts_enabled'),
    budget_monthly_warn_pct: clampPct(row['budget_monthly_warn_pct']),
    budget_category_warn_pct: clampPct(row['budget_category_warn_pct']),
    auto_capture_alerts_enabled: bool('auto_capture_alerts_enabled'),
    capture_failed_alerts_enabled: bool('capture_failed_alerts_enabled'),
    device_notifications_enabled: bool('device_notifications_enabled'),
    daily_expense_reminder_enabled: bool('daily_expense_reminder_enabled'),
    daily_expense_reminder_time: typeof time === 'string' ? time : typeof time === 'number' ? String(time) : '20:00',
    weekly_email_enabled: bool('weekly_email_enabled'),
    monthly_email_enabled: bool('monthly_email_enabled'),
    report_alerts_enabled: bool('report_alerts_enabled'),
    report_roast_level: ROAST_LEVELS.find((level) => level === row['report_roast_level']) ?? DEFAULT_SETTINGS.report_roast_level,
    card_layouts: parseCardLayouts(row['card_layouts']),
    reminders_enabled: bool('reminders_enabled'),
    reminder_default_lead_days: parseLeadDays(row['reminder_default_lead_days'], DEFAULT_SETTINGS.reminder_default_lead_days),
    reminder_time: hm(row['reminder_time'], DEFAULT_SETTINGS.reminder_time),
    reminder_overdue_nudges: clampInt(row['reminder_overdue_nudges'], 0, 5, DEFAULT_SETTINGS.reminder_overdue_nudges),
    reminder_quiet_enabled: bool('reminder_quiet_enabled'),
    reminder_quiet_start: hm(row['reminder_quiet_start'], DEFAULT_SETTINGS.reminder_quiet_start),
    reminder_quiet_end: hm(row['reminder_quiet_end'], DEFAULT_SETTINGS.reminder_quiet_end),
    reminder_hide_amounts: bool('reminder_hide_amounts'),
    upi_id: typeof row['upi_id'] === 'string' && row['upi_id'] !== '' ? row['upi_id'] : null,
    timezone: typeof row['timezone'] === 'string' && row['timezone'] !== '' ? row['timezone'] : null,
  };
}
