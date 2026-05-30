import { spacing } from "@/constants/theme";

/** Spend row: today ~45%, month ~55%. */
export const HOME_SPEND_FLEX = {
  today: 45,
  month: 55,
} as const;

/** Gap between sibling bento tiles (spend row, category grid, recent stack). */
export const HOME_BENTO_GAP = spacing.lg;

/** Vertical gap between major Home sections (spend, cash flow, categories, recent). */
export const HOME_BENTO_SECTION_GAP = spacing.xl;

/** Space below section titles before the bento card/grid. */
export const HOME_SECTION_HEADER_GAP = spacing.lg;

/** Inner padding for category/recent section bento boxes. */
export const HOME_SECTION_CARD_PADDING = spacing.lg;

export const HOME_SPEND_ROW_MIN_HEIGHT = 168;

export const HOME_CATEGORY_TILE_MIN_HEIGHT = 112;

export const HOME_RECENT_TILE_MIN_HEIGHT = 64;

export const HOME_INCOME_TILE_MIN_HEIGHT = 92;

/** Max categories shown in bento grid (2×2). */
export const HOME_MAX_CATEGORIES = 4;

/** Max recent transactions shown in mini-bento stack. */
export const HOME_MAX_RECENT = 5;
