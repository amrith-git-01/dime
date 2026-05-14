/**
 * Color tokens — design system §2.
 * @see docs/core/design-system.md
 */

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
  /** Settings / notification bento icon accents. */
  iconAccentSky: "#0284C7",
  iconAccentOrange: "#EA580C",
  /** Toast severity accents. */
  toastErrorAccent: "#B42318",
  toastWarningAccent: "#B54708",
  toastShadow: "#1F2937",
  /** OAuth brand (Google sign-in). */
  oauthGoogle: "#4285F4",
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
  scrimHeavy: "rgba(0,0,0,0.55)",
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
  primaryTint12: "rgba(99, 85, 232, 0.12)",
  primaryTint14: "rgba(99, 85, 232, 0.14)",
  primaryBorder28: "rgba(99, 85, 232, 0.28)",
  selectHighlight: "rgba(99, 85, 232, 0.08)",
  selectOnPrimaryBorder: "rgba(255,255,255,0.24)",
  selectOnPrimaryBg: "rgba(255,255,255,0.16)",
  iconWellSky: "rgba(56, 189, 248, 0.18)",
  iconWellOrange: "rgba(251, 146, 60, 0.2)",
  iconWellDanger: "rgba(220, 38, 38, 0.1)",
  dangerTint06: "rgba(220, 38, 38, 0.06)",
  dangerTint08: "rgba(220, 38, 38, 0.08)",
  onPrimaryChipBg: "rgba(255,255,255,0.1)",
  whiteOverlay55: "rgba(255, 255, 255, 0.55)",
  whiteOverlay92: "rgba(255,255,255,0.92)",
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

export type ColorToken = keyof typeof colors;
