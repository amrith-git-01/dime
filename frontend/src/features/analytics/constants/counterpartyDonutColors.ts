/** Rolled-up payees beyond the top six. */
export const COUNTERPARTY_DONUT_OTHER_KEY = "__other__";

/**
 * Distinct categorical hues for top payee slices — not brand primary / indigo family.
 * @see docs/specs/2026-05-30-analytics-insights-design.md (Block 3)
 */
export const COUNTERPARTY_DONUT_SLICE_COLORS = [
  "#0D9488",
  "#EA580C",
  "#DB2777",
  "#0284C7",
  "#CA8A04",
  "#059669",
] as const;

export const COUNTERPARTY_DONUT_OTHER_COLOR = "#9CA3AF";
