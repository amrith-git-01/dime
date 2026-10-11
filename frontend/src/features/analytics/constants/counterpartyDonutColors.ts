import { accent, hexToRgba, skeleton } from "@/constants";

/** Rolled-up payees beyond the top four. */
export const COUNTERPARTY_DONUT_OTHER_KEY = "__other__";

/** Single-hue accent opacity gradient for monochrome donut. Largest slice first. */
export const COUNTERPARTY_DONUT_SLICE_COLORS = [
  accent,
  hexToRgba(accent, 0.72),
  hexToRgba(accent, 0.5),
  hexToRgba(accent, 0.32),
  hexToRgba(accent, 0.18),
];

/** Neutral gray for the rolled-up "Other" slice and legend swatch. */
export const COUNTERPARTY_DONUT_OTHER_COLOR = skeleton.onSurface;
