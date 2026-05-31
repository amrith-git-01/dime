import { bentoTileMinHeight } from "@/constants/dimensions";

/** Home-only layout — shared gaps live in `@/components/bento/bentoLayoutTokens`. */

/** Spend row: today ~45%, month ~55%. */
export const HOME_SPEND_FLEX = {
  today: 45,
  month: 55,
} as const;

export const HOME_SPEND_ROW_MIN_HEIGHT = bentoTileMinHeight.homeSpendRow;

export const HOME_CATEGORY_TILE_MIN_HEIGHT = bentoTileMinHeight.homeCategory;

export const HOME_INCOME_TILE_MIN_HEIGHT = bentoTileMinHeight.homeIncome;

/** Max categories shown in bento grid (2×2). */
export const HOME_MAX_CATEGORIES = 4;

/** Max recent transactions shown in mini-bento stack. */
export const HOME_MAX_RECENT = 5;
