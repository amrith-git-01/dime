/**
 * Shared design tokens — single import surface for UI consistency.
 * @see docs/design-system.md
 */
export { customCategoryColorOptions } from "./bento";
/**
 * Only theme-invariant color tokens are exported here. Every other color comes from the active
 * theme (`useTheme()` / `createThemedStyles` in `@/theme`).
 */
export { categoryDefault, oauthGoogle } from "./colors";
export {
  categoryMutedBackground,
  contrastRatio,
  hexToRgba,
  readableCategoryColor,
  relativeLuminance,
  withAlpha,
  withHexAlphaSuffix,
} from "./colorUtils";
export { bentoTileMinHeight, budgetRowHeight } from "./dimensions";
export { fontFamilies, loadableAppFonts } from "./fonts";
export { useFormStyles } from "./formStyles";
export { iconSizes, type IconSizeToken } from "./iconSizes";
export { layout } from "./layout";
export {
  fabBreathe,
  fabIdleCloseMs,
  listEntrance,
  motion,
  skeletonPulse,
  springs,
  timings,
} from "./motion";
export { radius, type RadiusToken } from "./radius";
export { spacing, type SpacingToken } from "./spacing";
export { createTypography, tabularNums, type Typography } from "./typography";
