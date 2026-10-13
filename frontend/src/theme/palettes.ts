import { Platform, type ViewStyle } from "react-native";

import { bento as lightBento } from "@/constants/bento";
import {
  accent,
  accentHeat1,
  accentHeat2,
  accentHeat3,
  accentTint,
  categoryDefault,
  charts as lightCharts,
  colors as lightLegacy,
  danger,
  dangerTint,
  iconAccentOrange,
  iconAccentSky,
  ink,
  inkFaint,
  inkSoft,
  line,
  oauthGoogle,
  overlays as lightOverlays,
  paper,
  shadow,
  skeleton as lightSkeleton,
  success,
  successTint,
  surface,
  surfaces as lightSurfaces,
  surfaceSunken,
  warning,
  warningTint,
} from "@/constants/colors";
import { hexToRgba } from "@/constants/colorUtils";
import { shadows as lightShadows } from "@/constants/shadows";
import { createTypography, type Typography } from "@/constants/typography";

/**
 * Light and dark palettes: the single source of truth for every color in the app.
 *
 * Both share one `ThemeColors` shape (enforced by the type and by a unit test), so a component
 * never needs to know which scheme it is drawn in. Light is built from the existing constants;
 * dark is a soft dark: lifted near-black page, cards separated by lightness only (no borders
 * added), shadows off.
 *
 * Naming notes:
 *  - `accent` is the brand FILL (buttons, FAB, progress). `onAccent` is the label on it.
 *  - `accentText` is the accent used AS text/icon on a page or card (links, labels, selected
 *    state); it is lighter in dark so it stays readable.
 *  - `ink` doubles as an inverted fill (FAB, action bubbles); `onInk` is the glyph on it.
 */

export type ColorScheme = "light" | "dark";

export type ThemeColors = {
  paper: string;
  surface: string;
  surfaceSunken: string;
  line: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  accent: string;
  accentText: string;
  onAccent: string;
  onAccentMuted: string;
  onAccentHairline: string;
  onInk: string;
  /** Label/icon on a solid `danger` fill. */
  onDanger: string;
  /** Label/icon on a solid `success` fill. */
  onSuccess: string;
  /** Label/icon over photos and dark scrims (always light). */
  onMedia: string;
  /** Solid accent / danger fills while a button is disabled or busy. */
  accentDisabled: string;
  dangerDisabled: string;
  accentTint: string;
  accentHeat1: string;
  accentHeat2: string;
  accentHeat3: string;
  success: string;
  danger: string;
  warning: string;
  dangerTint: string;
  successTint: string;
  warningTint: string;
  /** Shadow color for the few remaining drop shadows. */
  shadow: string;
  categoryDefault: string;
  categoryDefaultMuted: string;
  /** Alpha of the category color behind a category icon tile. */
  categoryTileAlpha: number;
  iconAccentSky: string;
  iconAccentOrange: string;
  oauthGoogle: string;
  toastErrorAccent: string;
  toastWarningAccent: string;
  onboardingIllustrationBg: string;
  /** Always-light panel behind illustrations drawn in dark ink (auth hero Lottie). */
  illustrationPanel: string;
  overlays: {
    scrim: string;
    scrimHeavy: string;
    scrimLight: string;
    backdrop: string;
    avatarFallback: string;
    avatarError: string;
  };
  skeleton: {
    surface: string;
    onSurface: string;
  };
  charts: {
    tooltipScrim: string;
    netSurplusBar: string;
    netDeficitBar: string;
    payeeSliceColors: readonly string[];
    payeeOther: string;
  };
  /** Monochrome donut: single-hue gradient, largest slice first, plus the rolled-up "Other". */
  donut: {
    slices: readonly string[];
    other: string;
  };
  bento: {
    twoToneHeaderSurface: string;
    twoToneBodySurface: string;
    sectionSurface: string;
    /** Saturated category tile palette (same in both schemes). */
    surface: Readonly<Record<string, string>>;
    onCategoryTile: {
      primary: string;
      secondary: string;
      muted: string;
    };
    chart: { track: string; fill: string };
    chartOnPastel: { track: string; fill: string };
    /** FAB action bubble fill; the glyph on it is `onInk`. */
    actionIcon: string;
  };
  surfaces: {
    primaryTint10: string;
    primaryBorder28: string;
    selectHighlight: string;
    selectOnPrimaryBorder: string;
    selectOnPrimaryBg: string;
    iconWellSky: string;
    whiteOverlay55: string;
    whiteOverlay92: string;
    onPrimaryChipBg: string;
  };
};

export type ThemeShadows = {
  card: ViewStyle;
  cardElevated: ViewStyle;
  header: ViewStyle;
  sheet: ViewStyle;
  toast: ViewStyle;
  fab: ViewStyle;
  tabIndicator: ViewStyle;
  /** Small floating pill/thumb (segmented-control thumb, tiny round buttons). */
  pill: ViewStyle;
  /** Centered modal card. */
  modal: ViewStyle;
  /** Soft lavender card shadow (bento section cards, day bar). */
  tinted: ViewStyle;
};

export type Theme = {
  readonly scheme: ColorScheme;
  readonly colors: ThemeColors;
  readonly shadows: ThemeShadows;
  /** Text presets with the scheme's text colors baked in. */
  readonly typography: Typography;
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

// ─── Light ───────────────────────────────────────────────────────────────────

export const lightColors: ThemeColors = deepFreeze({
  paper,
  surface,
  surfaceSunken,
  line,
  ink,
  inkSoft,
  inkFaint,
  accent,
  accentText: accent,
  onAccent: "#FFFFFF",
  onAccentMuted: lightLegacy.textOnPrimaryMuted,
  onAccentHairline: lightLegacy.onPrimaryHairline,
  onInk: "#FFFFFF",
  onDanger: "#FFFFFF",
  onSuccess: "#FFFFFF",
  onMedia: "#FFFFFF",
  accentDisabled: "rgba(43, 63, 224, 0.6)",
  dangerDisabled: "rgba(214, 57, 74, 0.6)",
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
  categoryDefaultMuted: lightLegacy.categoryDefaultMuted,
  categoryTileAlpha: 0.08,
  iconAccentSky,
  iconAccentOrange,
  oauthGoogle,
  toastErrorAccent: lightLegacy.toastErrorAccent,
  toastWarningAccent: lightLegacy.toastWarningAccent,
  onboardingIllustrationBg: lightLegacy.onboardingIllustrationBg,
  illustrationPanel: "transparent",
  overlays: {
    scrim: lightOverlays.scrim,
    scrimHeavy: lightOverlays.scrimHeavy,
    scrimLight: lightOverlays.scrimLight,
    backdrop: lightOverlays.backdrop,
    avatarFallback: lightOverlays.avatarFallback,
    avatarError: lightOverlays.avatarError,
  },
  skeleton: {
    surface: lightSkeleton.surface,
    onSurface: lightSkeleton.onSurface,
  },
  charts: {
    tooltipScrim: lightCharts.tooltipScrim,
    netSurplusBar: lightCharts.netSurplusBar,
    netDeficitBar: lightCharts.netDeficitBar,
    payeeSliceColors: lightCharts.payeeSliceColors,
    payeeOther: lightCharts.payeeOther,
  },
  donut: {
    slices: [
      accent,
      hexToRgba(accent, 0.72),
      hexToRgba(accent, 0.5),
      hexToRgba(accent, 0.32),
      hexToRgba(accent, 0.18),
    ],
    other: lightSkeleton.onSurface,
  },
  bento: {
    twoToneHeaderSurface: lightBento.twoToneHeaderSurface,
    twoToneBodySurface: lightBento.twoToneBodySurface,
    sectionSurface: lightBento.sectionSurface,
    surface: lightBento.surface,
    onCategoryTile: lightBento.onCategoryTile,
    chart: lightBento.chart,
    chartOnPastel: lightBento.chartOnPastel,
    actionIcon: lightBento.actionIcon.manual,
  },
  surfaces: {
    primaryTint10: lightSurfaces.primaryTint10,
    primaryBorder28: lightSurfaces.primaryBorder28,
    selectHighlight: lightSurfaces.selectHighlight,
    selectOnPrimaryBorder: lightSurfaces.selectOnPrimaryBorder,
    selectOnPrimaryBg: lightSurfaces.selectOnPrimaryBg,
    iconWellSky: lightSurfaces.iconWellSky,
    whiteOverlay55: lightSurfaces.whiteOverlay55,
    whiteOverlay92: lightSurfaces.whiteOverlay92,
    onPrimaryChipBg: lightSurfaces.onPrimaryChipBg,
  },
});

// ─── Dark ────────────────────────────────────────────────────────────────────

const darkPaper = "#121214";
const darkSurface = "#1C1C20";
const darkSurfaceSunken = "#26262C";
const darkInk = "#F2F2F5";
const darkAccentText = "#8D9BFF";

export const darkColors: ThemeColors = deepFreeze({
  paper: darkPaper,
  surface: darkSurface,
  surfaceSunken: darkSurfaceSunken,
  line: "#2E2E35",
  ink: darkInk,
  inkSoft: "#A3A5B0",
  inkFaint: "#8A8D98",
  accent,
  accentText: darkAccentText,
  onAccent: "#FFFFFF",
  onAccentMuted: "rgba(255,255,255,0.88)",
  onAccentHairline: "rgba(255,255,255,0.22)",
  onInk: darkPaper,
  onDanger: darkPaper,
  onSuccess: darkPaper,
  onMedia: "#FFFFFF",
  accentDisabled: "rgba(43, 63, 224, 0.6)",
  dangerDisabled: "rgba(255, 107, 122, 0.6)",
  accentTint: "rgba(141, 155, 255, 0.14)",
  accentHeat1: "rgba(141, 155, 255, 0.16)",
  accentHeat2: "rgba(141, 155, 255, 0.34)",
  accentHeat3: "rgba(141, 155, 255, 0.62)",
  success: "#3DD68C",
  danger: "#FF6B7A",
  warning: "#F5B041",
  dangerTint: "rgba(255, 107, 122, 0.16)",
  successTint: "rgba(61, 214, 140, 0.16)",
  warningTint: "rgba(245, 176, 65, 0.16)",
  shadow,
  categoryDefault,
  categoryDefaultMuted: "rgba(148,163,184,0.18)",
  categoryTileAlpha: 0.16,
  iconAccentSky: "#38BDF8",
  iconAccentOrange: "#FB923C",
  oauthGoogle,
  toastErrorAccent: "#F97066",
  toastWarningAccent: "#FDB022",
  onboardingIllustrationBg: lightLegacy.onboardingIllustrationBg,
  illustrationPanel: "#F4F4F6",
  overlays: {
    scrim: "rgba(0,0,0,0.6)",
    scrimHeavy: "rgba(0,0,0,0.75)",
    scrimLight: "rgba(0,0,0,0.4)",
    backdrop: "rgba(0,0,0,0.3)",
    avatarFallback: "rgba(141, 155, 255, 0.18)",
    avatarError: "rgba(255,255,255,0.10)",
  },
  skeleton: {
    surface: darkSurfaceSunken,
    onSurface: "#32323A",
  },
  charts: {
    tooltipScrim: "rgba(255, 255, 255, 0.06)",
    netSurplusBar: "rgba(61, 214, 140, 0.40)",
    netDeficitBar: "rgba(255, 107, 122, 0.40)",
    payeeSliceColors: [
      "#2DD4BF",
      "#FB923C",
      "#F472B6",
      "#38BDF8",
      "#FACC15",
      "#34D399",
    ],
    payeeOther: "#7C8190",
  },
  donut: {
    slices: [
      darkAccentText,
      hexToRgba(darkAccentText, 0.72),
      hexToRgba(darkAccentText, 0.5),
      hexToRgba(darkAccentText, 0.32),
      hexToRgba(darkAccentText, 0.18),
    ],
    other: "#3A3A43",
  },
  bento: {
    twoToneHeaderSurface: darkSurfaceSunken,
    twoToneBodySurface: darkSurface,
    sectionSurface: darkSurfaceSunken,
    surface: lightBento.surface,
    onCategoryTile: lightBento.onCategoryTile,
    chart: { track: darkSurfaceSunken, fill: accent },
    chartOnPastel: { track: "rgba(141, 155, 255, 0.14)", fill: accent },
    actionIcon: darkInk,
  },
  surfaces: {
    primaryTint10: "rgba(141, 155, 255, 0.14)",
    primaryBorder28: "rgba(141, 155, 255, 0.28)",
    selectHighlight: "rgba(141, 155, 255, 0.14)",
    selectOnPrimaryBorder: "rgba(255,255,255,0.14)",
    selectOnPrimaryBg: "rgba(255,255,255,0.08)",
    iconWellSky: "rgba(56, 189, 248, 0.20)",
    whiteOverlay55: "rgba(255, 255, 255, 0.08)",
    whiteOverlay92: "rgba(28, 28, 32, 0.92)",
    onPrimaryChipBg: "rgba(255, 255, 255, 0.08)",
  },
});

// ─── Shadows ─────────────────────────────────────────────────────────────────

/** Cards separate by lightness in dark, so shadows are off. */
const noShadow: ViewStyle = Object.freeze(
  Platform.select({
    android: { elevation: 0 },
    default: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  }) as ViewStyle,
);

const tintedIos: ViewStyle = {
  shadowColor: lightBento.surface.lavender,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.12,
  shadowRadius: 10,
};

const pillIos: ViewStyle = {
  shadowColor: shadow,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 4,
};

const modalIos: ViewStyle = {
  shadowColor: shadow,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.18,
  shadowRadius: 24,
};

const lightThemeShadows: ThemeShadows = Object.freeze({
  card: lightShadows.card,
  cardElevated: lightShadows.cardElevated,
  header: lightShadows.header,
  sheet: lightShadows.sheet,
  toast: lightShadows.toast,
  fab: lightShadows.fab,
  tabIndicator: lightShadows.tabIndicator,
  pill: Platform.select({
    android: { elevation: 2 },
    default: pillIos,
  }) as ViewStyle,
  modal: Platform.select({
    android: { elevation: 24 },
    default: modalIos,
  }) as ViewStyle,
  tinted: Platform.select({
    android: { elevation: 2 },
    default: tintedIos,
  }) as ViewStyle,
});

const darkThemeShadows: ThemeShadows = Object.freeze({
  card: noShadow,
  cardElevated: noShadow,
  header: noShadow,
  sheet: noShadow,
  toast: noShadow,
  fab: noShadow,
  tabIndicator: noShadow,
  pill: noShadow,
  modal: noShadow,
  tinted: noShadow,
});

// ─── Themes (one frozen object per scheme, never rebuilt) ────────────────────

export const lightTheme: Theme = Object.freeze({
  scheme: "light",
  colors: lightColors,
  shadows: lightThemeShadows,
  typography: createTypography(lightColors),
});

export const darkTheme: Theme = Object.freeze({
  scheme: "dark",
  colors: darkColors,
  shadows: darkThemeShadows,
  typography: createTypography(darkColors),
});

export function getTheme(scheme: ColorScheme): Theme {
  return scheme === "dark" ? darkTheme : lightTheme;
}
