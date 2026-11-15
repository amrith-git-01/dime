/**
 * The nudge QR card is a shared image, the same in light and dark mode: a light card so phone cameras
 * and gallery scanners read the code reliably (dark modules on white, high contrast).
 */
export const qrCardPalette = {
  background: "#F4F5F7",
  ink: "#111111",
  muted: "#5B6068",
  panel: "#FFFFFF",
  module: "#000000",
} as const;
