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
  /** Hairline above light surfaces (e.g. bottom tab bar). */
  borderLight: "#E5E7EB",
  barBackground: "#FFFFFF",
  pageBackground: "#f9f9ff",
  textPrimary: "#151c27",
  textSecondary: "#464555",
  textOnPrimary: "#FFFFFF",
  textOnPrimaryMuted: "rgba(255,255,255,0.88)",
  onPrimaryHairline: "rgba(255,255,255,0.22)",
  /** Full-bleed header gradient (design system doc spending / hero violet). */
  headerGradientStart: "#6355E8",
  headerGradientEnd: "#8B7FF5",
  headerGreetingForeground: "rgba(255,255,255,0.75)",
  headerAvatarRingBorder: "rgba(255,255,255,0.4)",
  headerBellCircleBg: "rgba(255,255,255,0.15)",
  /** Inactive tab icon/label on primary tab bar */
  tabBarOnPrimaryInactive: "rgba(255,255,255,0.62)",
} as const;

/** 4dp base unit */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  /** Tab row height before safe-area bottom inset (icon-only compact). */
  tabBarHeight: 48,
  /** Bottom tab bar icons. */
  iconTab: 22,
  /** Header bottom curve radius (Option A). */
  headerCurveRadius: 24,
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
  /** Home header display name (Stitch title-lg scale) — light surfaces */
  headerDisplayName: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.01 * 20,
    color: colors.textPrimary,
  },
  /** Greeting on indigo / primary header */
  headerGreetingOnPrimary: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textOnPrimaryMuted,
  },
  /** Name on primary header (spending-card tone, doc-aligned) */
  headerDisplayNameOnPrimary: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.01 * 20,
    color: colors.textOnPrimary,
  },
  /** Full-bleed header line 1 (greeting) */
  headerGreetingLine: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.headerGreetingForeground,
  },
  /** Full-bleed header line 2 (username) */
  headerUsernameLine: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textOnPrimary,
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
