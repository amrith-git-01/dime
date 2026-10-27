/**
 * Broke Report tones: one bold background per slide, with text that stays readable on it.
 *
 * Light is bright backgrounds with ink text; dark is deep backgrounds with light text (the closing
 * tone is ink in both). Every pair is checked for WCAG AA in `theme/__tests__/reportPalette.test.ts`:
 * `text` and `textSoft` on `bg` and on `panel` (4.5:1), `highlight` on `bg` and `panel` (3:1, it is a
 * graphic) and `onHighlight` on `highlight` (4.5:1). `panel` is a solid, slightly lifted `bg` for
 * chips, bar tracks and cards, so contrast is exact.
 */

export type ReportTone = {
  bg: string;
  panel: string;
  text: string;
  textSoft: string;
  /** Peak bars, rank 1, chip fills. */
  highlight: string;
  /** Label on a `highlight` fill. */
  onHighlight: string;
};

export type ReportToneId =
  | "iris"
  | "coral"
  | "grape"
  | "sky"
  | "sun"
  | "mint"
  | "lime"
  | "ink";

export type ReportPalette = Readonly<Record<ReportToneId, ReportTone>>;

const lightText = "#14151A";
const lightSoft = "#3A3C47";

export const reportPaletteLight: ReportPalette = {
  iris: { bg: "#C9CEFF", panel: "#E7E9FF", text: lightText, textSoft: lightSoft, highlight: "#2B3FE0", onHighlight: "#FFFFFF" },
  coral: { bg: "#FFC9BF", panel: "#FFE7E2", text: lightText, textSoft: lightSoft, highlight: "#C42E3F", onHighlight: "#FFFFFF" },
  grape: { bg: "#E3CCFF", panel: "#F2E8FF", text: lightText, textSoft: lightSoft, highlight: "#6D2FC4", onHighlight: "#FFFFFF" },
  sky: { bg: "#BFE6FF", panel: "#E2F4FF", text: lightText, textSoft: lightSoft, highlight: "#0B5FA8", onHighlight: "#FFFFFF" },
  sun: { bg: "#FFE08A", panel: "#FFF1CA", text: lightText, textSoft: lightSoft, highlight: "#14151A", onHighlight: "#FFE08A" },
  mint: { bg: "#BFF0D6", panel: "#E2F8ED", text: lightText, textSoft: lightSoft, highlight: "#0F6E43", onHighlight: "#FFFFFF" },
  lime: { bg: "#DDF59A", panel: "#F0FBD2", text: lightText, textSoft: lightSoft, highlight: "#3A6200", onHighlight: "#FFFFFF" },
  ink: { bg: "#14151A", panel: "#303135", text: "#FAFAFA", textSoft: "#C9CBD6", highlight: "#FFD84D", onHighlight: "#14151A" },
};

const darkText = "#F2F2F5";
const darkSoft = "#D6D8E2";

export const reportPaletteDark: ReportPalette = {
  iris: { bg: "#1A2166", panel: "#313775", text: darkText, textSoft: darkSoft, highlight: "#9AA6FF", onHighlight: "#10143F" },
  coral: { bg: "#5E1A22", panel: "#6E3138", text: darkText, textSoft: darkSoft, highlight: "#FF8A93", onHighlight: "#3A0D13" },
  grape: { bg: "#3A1D6B", panel: "#4E347A", text: darkText, textSoft: darkSoft, highlight: "#C9A2FF", onHighlight: "#24103F" },
  sky: { bg: "#0C3A5E", panel: "#244E6E", text: darkText, textSoft: darkSoft, highlight: "#6CC4FF", onHighlight: "#06243D" },
  sun: { bg: "#4D3A06", panel: "#5F4E1F", text: darkText, textSoft: darkSoft, highlight: "#FFD84D", onHighlight: "#2E2203" },
  mint: { bg: "#0E4A33", panel: "#265C47", text: darkText, textSoft: darkSoft, highlight: "#5FE0A4", onHighlight: "#072D1F" },
  lime: { bg: "#34470A", panel: "#485923", text: darkText, textSoft: darkSoft, highlight: "#C8F060", onHighlight: "#1E2A05" },
  ink: { bg: "#0B0B0E", panel: "#232326", text: darkText, textSoft: darkSoft, highlight: "#FFD84D", onHighlight: "#14151A" },
};
