/**
 * Shared design tokens — single import surface for UI consistency.
 * @see docs/design-system.md
 */
export { bento, customCategoryColorOptions } from "./bento";
export {
  accent,
  accentHeat1,
  accentHeat2,
  accentHeat3,
  accentTint,
  categoryDefault,
  categoryTile,
  charts,
  // New primary exports
  color,
  // Legacy aliases (kept for migration)
  colors,
  danger,
  dangerTint,
  hero,
  iconAccentOrange,
  iconAccentSky,
  ink,
  inkFaint,
  inkSoft,
  line,
  oauthGoogle,
  overlays,
  paper,
  progressBar,
  shadow,
  skeleton,
  success,
  successTint,
  surface,
  warningTint,
  surfaceSunken,
  surfaces,
  warning,
  type ColorToken,
} from "./colors";
export {
  categoryMutedBackground,
  hexToRgba,
  withHexAlphaSuffix,
} from "./colorUtils";
export { bentoTileMinHeight, budgetRowHeight } from "./dimensions";
export { fontFamilies, loadableAppFonts } from "./fonts";
export { formStyles } from "./formStyles";
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
export { shadows } from "./shadows";
export { spacing, type SpacingToken } from "./spacing";
export { typography } from "./typography";
