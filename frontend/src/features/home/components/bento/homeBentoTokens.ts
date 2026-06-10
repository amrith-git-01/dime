import { bentoTileMinHeight } from "@/constants/dimensions";

/** Home-only layout; shared gaps are exported from `@/components/bento`. */

/** Spend row: today ~45%, month ~55%. */
export const HOME_SPEND_FLEX = {
  today: 45,
  month: 55,
} as const;

export const HOME_SPEND_ROW_MIN_HEIGHT = bentoTileMinHeight.homeSpendRow;

/** Month progress ring diameter; today bar chart uses the same visual height. */
export const HOME_SPEND_RING_SIZE = 80;

/** Day labels under bars (marginTop 4 + lineHeight 12). */
export const HOME_SPEND_CHART_LABEL_HEIGHT = 16;

export const HOME_SPEND_CHART_BAR_HEIGHT =
  HOME_SPEND_RING_SIZE - HOME_SPEND_CHART_LABEL_HEIGHT;

export const HOME_INCOME_TILE_MIN_HEIGHT = bentoTileMinHeight.homeIncome;

/** Max categories shown in the home top-categories list. */
export const HOME_MAX_CATEGORIES = 4;

/** Max recent transactions shown in mini-bento stack. */
export const HOME_MAX_RECENT = 5;
