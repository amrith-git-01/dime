/**
 * Bento grid surfaces — updated for Monochrome Design System.
 *
 * The colorful pastel tile surfaces are retained only for category icon tiles
 * (the one governed exception). Everything else now uses neutral surfaces.
 */
import {
  accent,
  accentTint,
  ink,
  inkFaint,
  inkSoft,
  surface,
  surfaceSunken,
} from "./colors";

export const bento = {
  // Pastel backgrounds removed — replaced by neutral card system.
  // Keeping only for category color tiles (governed exception).
  monthSpendSurface: surfaceSunken,
  incomeExpenseSurface: surfaceSunken,
  twoToneHeaderSurface: surfaceSunken,
  twoToneBodySurface: surface,
  sectionSurface: surfaceSunken,

  /** Category icon tile palettes — retained for recognition. */
  surface: {
    lavender: "#8B7FF5",
    mint: "#4ADE80",
    sky: "#38BDF8",
    coral: "#FF6B6B",
    peach: "#FB923C",
    teal: "#4ECDC4",
    indigo: "#818CF8",
    rose: "#F472B6",
  },
  /** Type on white/light neutral surfaces (standard token usage). */
  onSurface: {
    primary: ink,
    secondary: inkSoft,
    muted: inkFaint,
  },
  /** Type on saturated category tile surfaces (unchanged — still colorful). */
  onCategoryTile: {
    primary: "#FFFFFF",
    secondary: "rgba(255,255,255,0.85)",
    muted: "rgba(255,255,255,0.65)",
  },
  /** Type on soft pastel tile backgrounds. */
  onPastel: {
    primary: ink,
    secondary: inkSoft,
    muted: inkFaint,
    accent,
  },
  chart: {
    track: surfaceSunken,
    fill: accent,
  },
  chartOnPastel: {
    track: accentTint,
    fill: accent,
  },
  icon: {
    bg: surfaceSunken,
    fg: ink,
  },
  /** FAB action bubble fills — now ink-colored. */
  actionIcon: {
    manual: ink,
    receipt: ink,
    voice: ink,
  },
} as const;

/** Preset hex options for custom category creation — unchanged (governs category marks). */
export const customCategoryColorOptions = [
  bento.surface.coral,
  bento.surface.teal,
  "#A855F7",
  bento.surface.mint,
  bento.surface.peach,
  "#FBBF24",
  bento.surface.indigo,
  bento.surface.rose,
  "#34D399",
  "#94A3B8",
  accent,
  "#EF4444",
  "#0EA5E9",
  "#14B8A6",
  "#84CC16",
  "#EC4899",
  "#6366F1",
  "#78716C",
] as const;
