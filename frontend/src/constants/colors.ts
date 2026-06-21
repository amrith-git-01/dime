/**
 * Color tokens — Dime Monochrome Design System.
 *
 * Rule: if you're not showing money or an alert, you don't get color.
 * Everything else is ink, gray, and white. The indigo accent is earned.
 *
 * @see docs/design-system.md
 */

// ─── Core Palette ────────────────────────────────────────────────────────────

/** App background — true near-white, no tint. */
export const paper = "#FAFAFA";

/** Cards, sheets, inputs — pure white, elevated via shadow only. */
export const surface = "#FFFFFF";

/** Track backgrounds, skeleton base, pressed states. */
export const surfaceSunken = "#F1F1F3";

/** The only border color in the system — hairline dividers only, never card outlines. */
export const line = "#EAEAEC";

/** All primary text, headings, default icon color. */
export const ink = "#14151A";

/** Secondary text, captions, timestamps, inactive labels. */
export const inkSoft = "#5B5D68";

/** Placeholder text, disabled states. */
export const inkFaint = "#A0A2AD";

// ─── Accent (Earned — use sparingly) ─────────────────────────────────────────

/**
 * The single accent color. Reserved strictly for:
 *  1. Monetary amounts / debits
 *  2. Primary CTA buttons / FAB
 *  3. Selected/active states (calendar days, active tab indicator)
 *  4. Progress bar fills
 */
export const accent = "#2B3FE0";

/** Pale accent tint for chip/pill backgrounds, "View all" pills, etc. */
export const accentTint = "rgba(43, 63, 224, 0.08)";

/** Accent at 12% — low-spend heatmap cells. */
export const accentHeat1 = "rgba(43, 63, 224, 0.12)";

/** Accent at 28% — medium-spend heatmap cells. */
export const accentHeat2 = "rgba(43, 63, 224, 0.28)";

/** Accent at 60% — high-spend heatmap cells (white text required). */
export const accentHeat3 = "rgba(43, 63, 224, 0.60)";

// ─── Semantic (Functional Indicators Only) ───────────────────────────────────

/** Credit amounts, positive net — text/small badge only. */
export const success = "#1A8754";

/** Overspend amounts, destructive actions — text/small badge only. */
export const danger = "#D6394A";

/** 80% threshold warning — text/small badge only. */
export const warning = "#B5790A";

/** Danger tint for swipe-delete backgrounds, destructive state surfaces. */
export const dangerTint = "rgba(214, 57, 74, 0.08)";

/** Success tint for credit row surfaces. */
export const successTint = "rgba(26, 135, 84, 0.08)";

/** Warning tint for near-budget surfaces. */
export const warningTint = "rgba(181, 121, 10, 0.08)";

// ─── Overlays & Scrims ────────────────────────────────────────────────────────

export const overlays = {
  scrim: "rgba(0,0,0,0.35)",
  scrimHeavy: "rgba(0,0,0,0.55)",
  scrimLight: "rgba(20, 21, 26, 0.22)",
  backdrop: "rgba(20, 21, 26, 0.12)",
  avatarFallback: "rgba(43, 63, 224, 0.12)",
  avatarError: "rgba(0,0,0,0.10)",
  /** @deprecated use skeleton.surface */
  avatarSkeleton: "rgba(255,255,255,0.28)",
} as const;

// ─── Category Icon Tiles ──────────────────────────────────────────────────────

/** Uncategorized / fallback category mark. */
export const categoryDefault = "#94A3B8";

/** Helper: produces an 8%-tint background for a category icon tile. */
export const categoryTile = (hex: string) =>
  hex.startsWith("#")
    ? `${hex}14` // appends 08 in hex = ~5%, 14 = ~8%
    : hex;

// ─── Skeleton Loading ─────────────────────────────────────────────────────────

export const skeleton = {
  /** Base surface — neutral gray, not a purple tint. */
  surface: "#EAEAEC",
  /** Highlight during pulse animation. */
  onSurface: "#D4D4D8",
  /** @deprecated use onSurface */
  onPrimary: "#D4D4D8",
} as const;

// ─── Chart Tokens ─────────────────────────────────────────────────────────────

export const charts = {
  tooltipScrim: "rgba(20, 21, 26, 0.06)",
  /** Surplus (cash-flow bar): success at low opacity. */
  netSurplusBar: "rgba(26, 135, 84, 0.32)",
  /** Deficit (cash-flow bar): danger at low opacity. */
  netDeficitBar: "rgba(214, 57, 74, 0.32)",
  /** Category slice/bar palette — retained for recognition. */
  payeeSliceColors: [
    "#0D9488",
    "#EA580C",
    "#DB2777",
    "#0284C7",
    "#CA8A04",
    "#059669",
  ] as const,
  payeeOther: "#9CA3AF",
} as const;

// ─── Utility / Misc ───────────────────────────────────────────────────────────

export const shadow = "#000000";

/** Settings / notification bento icon accents — functional only. */
export const iconAccentSky = "#0284C7";
export const iconAccentOrange = "#EA580C";

/** OAuth brand (Google sign-in). */
export const oauthGoogle = "#4285F4";

// ─── Convenience Object (for components that spread all tokens) ───────────────

export const color = {
  paper,
  surface,
  surfaceSunken,
  line,
  ink,
  inkSoft,
  inkFaint,
  accent,
  accentTint,
  accentHeat1,
  accentHeat2,
  accentHeat3,
  success,
  danger,
  warning,
  dangerTint,
  successTint,
  warningTint,
  shadow,
  categoryDefault,
  skeleton,
  charts,
  overlays,
} as const;

// ─── Legacy Aliases (kept for backward-compat during migration) ───────────────
// These will be removed once all components are migrated.

/** @deprecated use `accent` */
export const colors = {
  primary: accent,
  brandPrimary: accent,
  primaryMuted: accentTint,
  success,
  danger,
  error: danger,
  inactive: inkFaint,
  border: line,
  cardBorder: line,
  borderLight: line,
  borderList: surfaceSunken,
  barBackground: surface,
  surfaceTint: surfaceSunken,
  pageBackground: paper,
  onboardingIllustrationBg: "#F7EFE1",
  textPrimary: ink,
  textSecondary: inkSoft,
  textListPrimary: ink,
  textListSecondary: inkSoft,
  textOnPrimary: "#FFFFFF",
  textOnPrimaryMuted: "rgba(255,255,255,0.88)",
  onPrimaryHairline: "rgba(255,255,255,0.22)",
  // Gradient tokens removed — no more purple header gradient
  headerGradientStart: surface,
  headerGradientEnd: surface,
  headerGreetingForeground: inkSoft,
  headerAvatarRingBorder: line,
  headerBellCircleBg: surfaceSunken,
  tabBarOnPrimaryInactive: inkFaint,
  categoryDefault,
  categoryDefaultMuted: "rgba(148,163,184,0.14)",
  shadow,
  shadowBrand: shadow,
  iconAccentSky,
  iconAccentOrange,
  toastErrorAccent: "#B42318",
  toastWarningAccent: "#B54708",
  toastShadow: ink,
  oauthGoogle,
} as const;

/** @deprecated use `overlays` */
export const hero = {
  orbLarge: "rgba(255,255,255,0.09)",
  orbSmall: "rgba(255,255,255,0.06)",
  progressTrack: surfaceSunken,
  statBg: surfaceSunken,
  statBorder: line,
  chipBorder: line,
  chipBg: surfaceSunken,
  avatarRing: line,
  skeletonShort: skeleton.surface,
  skeletonLong: skeleton.surface,
  sparkBar: inkSoft,
} as const;

/** @deprecated */
export const surfaces = {
  primaryTint08: accentTint,
  primaryTint10: "rgba(43, 63, 224, 0.10)",
  primaryTint12: "rgba(43, 63, 224, 0.12)",
  primaryTint14: "rgba(43, 63, 224, 0.14)",
  primaryBorder28: "rgba(43, 63, 224, 0.28)",
  selectHighlight: accentTint,
  selectOnPrimaryBorder: "rgba(255,255,255,0.24)",
  selectOnPrimaryBg: "rgba(255,255,255,0.16)",
  iconWellSky: "rgba(56, 189, 248, 0.18)",
  iconWellOrange: "rgba(251, 146, 60, 0.2)",
  iconWellDanger: dangerTint,
  dangerTint06: "rgba(214, 57, 74, 0.06)",
  dangerTint08: dangerTint,
  successTint14: successTint,
  onPrimaryChipBg: "rgba(255, 255, 255, 0.1)",
  whiteOverlay55: "rgba(255, 255, 255, 0.55)",
  whiteOverlay92: "rgba(255, 255, 255, 0.92)",
} as const;

/** @deprecated use `skeleton` */
export const progressBar = {
  track: surfaceSunken,
  fillDefault: accent,
} as const;

export type ColorToken = keyof typeof color;
