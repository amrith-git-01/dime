/** Screens whose cards the user can arrange. Transactions is out of scope. */
export const CARD_SCREENS = ["home", "budgets", "insights"] as const;
export type CardScreen = (typeof CARD_SCREENS)[number];

/**
 * Stable ids of the cards, per screen. They are saved on the server, so never rename one: add a
 * new id instead (an unknown saved id is dropped, a new one is slotted in by `normalizeCardOrder`).
 */
export const HOME_CARD_IDS = [
  "home.month",
  "home.getStarted",
  "home.stats",
  "home.upcoming",
  "home.categories",
  "home.recent",
] as const;

export const BUDGETS_CARD_IDS = [
  "budgets.summary",
  "budgets.recurring",
  "budgets.categories",
] as const;

export const INSIGHTS_CARD_IDS = [
  "insights.month",
  "insights.summary",
  "insights.fixedCosts",
  "insights.cashflow",
  "insights.payees",
  "insights.income",
  "insights.topExpenses",
  "insights.compare",
] as const;

export type HomeCardId = (typeof HOME_CARD_IDS)[number];
export type BudgetsCardId = (typeof BUDGETS_CARD_IDS)[number];
export type InsightsCardId = (typeof INSIGHTS_CARD_IDS)[number];
export type CardId = HomeCardId | BudgetsCardId | InsightsCardId;

export type CardIdOf<S extends CardScreen> = S extends "home"
  ? HomeCardId
  : S extends "budgets"
    ? BudgetsCardId
    : InsightsCardId;

/** The order every screen had before cards could be arranged; also what "Reset to default" restores. */
export const DEFAULT_CARD_ORDER: { [S in CardScreen]: readonly CardIdOf<S>[] } = {
  home: HOME_CARD_IDS,
  budgets: BUDGETS_CARD_IDS,
  insights: INSIGHTS_CARD_IDS,
};

/**
 * Saved order per screen, as the server stores it. A missing screen means the default order; an
 * empty list in a patch means "back to the default" (the server then drops the screen's key).
 */
export type CardLayouts = Partial<Record<CardScreen, string[]>>;

/** Anything (an old cache, a server answer) -> well-formed layouts: known screens, non-empty string lists. */
export function sanitizeCardLayouts(value: unknown): CardLayouts {
  const out: CardLayouts = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return out;
  }
  const record = value as Record<string, unknown>;
  for (const screen of CARD_SCREENS) {
    const ids = record[screen];
    if (
      Array.isArray(ids) &&
      ids.length > 0 &&
      ids.every((id) => typeof id === "string")
    ) {
      out[screen] = ids as string[];
    }
  }
  return out;
}

/**
 * Applies a layouts patch to stored layouts per screen: patching `home` leaves `budgets` alone and
 * an empty list removes the screen's saved order. Mirrors what the server does.
 */
export function mergeCardLayouts(
  current: CardLayouts | undefined,
  patch: CardLayouts | undefined,
): CardLayouts {
  const out: CardLayouts = { ...current };
  if (!patch) {
    return out;
  }
  for (const screen of CARD_SCREENS) {
    const ids = patch[screen];
    if (ids === undefined) {
      continue;
    }
    if (ids.length === 0) {
      delete out[screen];
    } else {
      out[screen] = ids;
    }
  }
  return out;
}
