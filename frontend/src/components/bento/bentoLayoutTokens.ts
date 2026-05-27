import { bentoTileMinHeight } from "@/constants/dimensions";
import { spacing } from "@/constants/spacing";

/** Gap between sibling bento tiles (spend row, category grid, recent stack). */
export const BENTO_GAP = spacing.lg;

/** Vertical gap between major bento sections. */
export const BENTO_SECTION_GAP = spacing.xl;

/** Space below section titles before the bento card/grid. */
export const BENTO_SECTION_HEADER_GAP = spacing.lg;

/** Inner padding for category/recent section bento boxes. */
export const BENTO_SECTION_CARD_PADDING = spacing.lg;

/** Min height for recent / transaction mini-bento rows. */
export const BENTO_TRANSACTION_TILE_MIN_HEIGHT = bentoTileMinHeight.homeRecent;
