/** The app's own URL scheme (`app.json` `scheme` and the Android intent filter). */
export const DEEP_LINK_SCHEME = "dime";

/** Links the Android home-screen widgets open. Parsed by `parseDeepLink`. */
export const deepLinkUrls = {
  home: `${DEEP_LINK_SCHEME}://home`,
  /** Quick add with the amount keypad focused, dated today. */
  addToday: `${DEEP_LINK_SCHEME}://add?date=today`,
  scan: `${DEEP_LINK_SCHEME}://scan`,
  voice: `${DEEP_LINK_SCHEME}://voice`,
  budgets: `${DEEP_LINK_SCHEME}://budgets`,
  budgetsRecurring: `${DEEP_LINK_SCHEME}://budgets/recurring`,
  agent: `${DEEP_LINK_SCHEME}://agent`,
} as const;
