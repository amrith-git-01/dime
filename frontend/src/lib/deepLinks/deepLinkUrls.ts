/** The app's own URL scheme (`app.json` `scheme` and the Android intent filter). */
export const DEEP_LINK_SCHEME = "dime";

/** Links the app opens (the widget's header and Ask AI button use `home` and `agent`). Parsed by `parseDeepLink`. */
export const deepLinkUrls = {
  home: `${DEEP_LINK_SCHEME}://home`,
  /** Quick add with the amount keypad focused, dated today. */
  addToday: `${DEEP_LINK_SCHEME}://add?date=today`,
  scan: `${DEEP_LINK_SCHEME}://scan`,
  voice: `${DEEP_LINK_SCHEME}://voice`,
  budgets: `${DEEP_LINK_SCHEME}://budgets`,
  budgetsRecurring: `${DEEP_LINK_SCHEME}://budgets/recurring`,
  agent: `${DEEP_LINK_SCHEME}://agent`,
  /** The Reminders list. */
  reminders: `${DEEP_LINK_SCHEME}://reminders`,
} as const;

/**
 * Quick add with a payee and a note filled in (a capture that needs the rupee amount, e.g. a receipt in a foreign
 * currency): the keypad is focused for the amount. Parsed by `parseDeepLink`.
 */
export function addDeepLinkUrl(input: { payee?: string | null; note?: string | null }): string {
  const params = [`focus=amount`];
  if (input.payee) {
    params.push(`payee=${encodeURIComponent(input.payee)}`);
  }
  if (input.note) {
    params.push(`note=${encodeURIComponent(input.note)}`);
  }
  return `${DEEP_LINK_SCHEME}://add?${params.join("&")}`;
}

/** A Broke Report: `dime://reports/YYYY-MM`. Parsed by `parseDeepLink`. */
export function reportDeepLinkUrl(periodKey: string): string {
  return `${DEEP_LINK_SCHEME}://reports/${periodKey}`;
}

/**
 * The widget's own scheme. Its Add / Scan / Gallery / Voice buttons open the small capture card
 * (`WidgetActionsActivity`), not the app, so they cannot use `dime://`: MainActivity claims that.
 */
export const CARD_LINK_SCHEME = "dimecard";

export type CardLinkMode = "add" | "scan" | "gallery" | "voice";

/** The widget button's link. `token` (`getWidgetCardToken`) proves the tap came from our own widget. */
export function cardLinkUrl(mode: CardLinkMode, token: string): string {
  return `${CARD_LINK_SCHEME}://${mode}?t=${token}`;
}
