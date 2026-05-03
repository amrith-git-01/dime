/**
 * Design tokens from Stitch project "Dime bottom navigation" (Modern Financial Utility).
 * @see project id 11127454722545275827 — bottom tab bar: 56dp + safe area, 24dp icons, 11px labels.
 * Typography: Inter for UI copy; JetBrains Mono for figures, codes, and tabular data.
 */

import { fontFamilies } from "./fonts";

export const colors = {
  primary: "#4F46E5",
  inactive: "#6B7280",
  border: "#E5E7EB",
  barBackground: "#FFFFFF",
  pageBackground: "#f9f9ff",
  textPrimary: "#151c27",
  textSecondary: "#464555",
} as const;

/** 4dp base unit */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  tabBarHeight: 56,
  iconTab: 24,
} as const;

export const typography = {
  tabLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
  },
  screenTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.01 * 24,
  },
  screenSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  /** Currency and numeric displays */
  mono: {
    fontFamily: fontFamilies.mono,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  monoEmphasis: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
};
