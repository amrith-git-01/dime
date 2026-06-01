/**
 * Bento grid surfaces — design system §2.7.
 */
import { colors } from "./colors";

export const bento = {
  /** Soft sky pastel — month spend tile background. */
  monthSpendSurface: "#E0F2FE",
  /** Soft lavender pastel — cash-flow tile background. */
  incomeExpenseSurface: "#EDE9FE",
  /** Two-tone card header — Transactions month + Budget summary (brand violet). */
  twoToneHeaderSurface: "#EEEDFB",
  /** Two-tone card body — stats row beneath header (clean white). */
  twoToneBodySurface: "#FFFFFF",
  /** Outer wrapper for section bento boxes (recent, categories). */
  sectionSurface: "#F5F3FF",
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
  /** White type on saturated / gradient tiles (today, category cells). */
  onSurface: {
    primary: "#FFFFFF",
    secondary: "rgba(255,255,255,0.85)",
    muted: "rgba(255,255,255,0.65)",
  },
  /** Dark type on soft pastel tile backgrounds. */
  onPastel: {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    muted: colors.textListSecondary,
    accent: colors.primary,
  },
  chart: {
    track: "rgba(255,255,255,0.28)",
    fill: "#FFFFFF",
  },
  /** Progress ring on light pastel surfaces. */
  chartOnPastel: {
    track: "rgba(99, 85, 232, 0.16)",
    fill: colors.brandPrimary,
  },
  icon: {
    bg: "rgba(255,255,255,0.18)",
    fg: "#FFFFFF",
  },
  /** Pastel circles for quick-add icon buttons. */
  actionIcon: {
    manual: "#8B7FF5",
    receipt: "#38BDF8",
    voice: "#4ADE80",
  },
} as const;

/** Preset hex options for custom category creation. */
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
  colors.categoryDefault,
  colors.brandPrimary,
  "#EF4444",
  "#0EA5E9",
  "#14B8A6",
  "#84CC16",
  "#EC4899",
  "#6366F1",
  "#78716C",
] as const;
