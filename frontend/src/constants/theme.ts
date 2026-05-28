/**
 * Design tokens — single source of truth for UI.
 * @see docs/core/design-system.md
 */
import { fontFamilies } from "./fonts";

export const colors = {
  primary: "#4F46E5",
  /** Design-system primary (`#6355E8`) — hero, FAB, accents. */
  brandPrimary: "#6355E8",
  primaryMuted: "#EEEDFB",
  success: "#16A34A",
  danger: "#DC2626",
  error: "#BA1A1A",
  inactive: "#6B7280",
  border: "#E5E7EB",
  cardBorder: "#E0DFFA",
  borderLight: "#E5E7EB",
  borderList: "#EEEEFF",
  barBackground: "#FFFFFF",
  surfaceTint: "#FAFAFF",
  pageBackground: "#f9f9ff",
  textPrimary: "#151c27",
  textSecondary: "#464555",
  textListPrimary: "#0A0A1F",
  textListSecondary: "#6B6B80",
  textOnPrimary: "#FFFFFF",
  textOnPrimaryMuted: "rgba(255,255,255,0.88)",
  onPrimaryHairline: "rgba(255,255,255,0.22)",
  headerGradientStart: "#6355E8",
  headerGradientEnd: "#8B7FF5",
  headerGreetingForeground: "rgba(255,255,255,0.75)",
  headerAvatarRingBorder: "rgba(255,255,255,0.4)",
  headerBellCircleBg: "rgba(255,255,255,0.15)",
  tabBarOnPrimaryInactive: "rgba(255,255,255,0.62)",
  /** Uncategorized / fallback category (design system Slate). */
  categoryDefault: "#94A3B8",
  categoryDefaultMuted: "rgba(148,163,184,0.14)",
  shadow: "#000000",
  shadowBrand: "#2a2740",
} as const;

/** Translucent surfaces on violet hero / header gradients. */
export const hero = {
  orbLarge: "rgba(255,255,255,0.09)",
  orbSmall: "rgba(255,255,255,0.06)",
  progressTrack: "rgba(255,255,255,0.24)",
  statBg: "rgba(255,255,255,0.12)",
  statBorder: "rgba(255,255,255,0.18)",
  chipBorder: "rgba(255,255,255,0.35)",
  chipBg: "rgba(255,255,255,0.16)",
  avatarRing: "rgba(255,255,255,0.12)",
  skeletonShort: "rgba(255,255,255,0.32)",
  skeletonLong: "rgba(255,255,255,0.38)",
  sparkBar: "rgba(255,255,255,0.8)",
} as const;

/** Modal / overlay scrims. */
export const overlays = {
  scrim: "rgba(0,0,0,0.35)",
  scrimLight: "rgba(21, 28, 39, 0.22)",
  backdrop: "rgba(15, 23, 42, 0.14)",
  avatarFallback: "rgba(99,85,232,0.2)",
  avatarError: "rgba(0,0,0,0.14)",
  avatarSkeleton: "rgba(255,255,255,0.28)",
} as const;

/** Tinted fills on light surfaces. */
export const surfaces = {
  primaryTint08: "rgba(99, 85, 232, 0.08)",
  primaryTint10: "rgba(99, 85, 232, 0.10)",
  selectHighlight: "rgba(99, 85, 232, 0.08)",
  selectOnPrimaryBorder: "rgba(255,255,255,0.24)",
  selectOnPrimaryBg: "rgba(255,255,255,0.16)",
} as const;

/** Progress meters (hero, budget, category rail). */
export const progressBar = {
  track: "#F2F0FF",
  fillDefault: "#FF6B6B",
} as const;

/** Loading skeleton surfaces. */
export const skeleton = {
  surface: "rgba(99, 85, 232, 0.12)",
  onPrimary: "rgba(255, 255, 255, 0.24)",
} as const;

/** Border radius scale — design system § Border Radius. */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  x2l: 32,
  hero: 22,
  stat: 16,
  full: 9999,
} as const;

/** 4dp base unit */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  tabBarHeight: 48,
  iconTab: 22,
  headerCurveRadius: 24,
} as const;

/** Reusable layout presets (spread into StyleSheet rules). */
export const layout = {
  screenContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  card: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardCompact: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroCard: {
    borderRadius: radius.hero,
    padding: spacing.xl,
    backgroundColor: colors.headerGradientStart,
    borderWidth: 1,
    borderColor: colors.headerGradientEnd,
  },
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
  sectionTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  linkSmall: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
  },
  cardTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  cardBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  emptyHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inactive,
  },
  emptyBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  headerDisplayName: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.01 * 20,
    color: colors.textPrimary,
  },
  headerGreetingOnPrimary: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textOnPrimaryMuted,
  },
  headerDisplayNameOnPrimary: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.01 * 20,
    color: colors.textOnPrimary,
  },
  headerGreetingLine: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.headerGreetingForeground,
  },
  headerUsernameLine: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textOnPrimary,
  },
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
  transactionList: {
    merchant: {
      fontFamily: fontFamilies.semiBold,
      fontSize: 16,
      lineHeight: 20,
      color: colors.textListPrimary,
    },
    time: {
      fontFamily: fontFamilies.regular,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textListSecondary,
    },
    via: {
      fontFamily: fontFamilies.regular,
      fontSize: 11,
      lineHeight: 14,
      color: colors.textListSecondary,
    },
    categoryTag: {
      fontFamily: fontFamilies.medium,
      fontSize: 10,
      lineHeight: 13,
      color: colors.textListPrimary,
    },
    tagSeparator: {
      fontFamily: fontFamilies.regular,
      fontSize: 11,
      lineHeight: 14,
      color: colors.textListSecondary,
    },
    amount: {
      fontFamily: fontFamilies.monoSemiBold,
      fontSize: 16,
      lineHeight: 20,
      color: colors.textListPrimary,
    },
  },
};
