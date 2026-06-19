import { charts } from "@/constants";

/** Rolled-up payees beyond the top four. */
export const COUNTERPARTY_DONUT_OTHER_KEY = "__other__";

/**
 * Distinct categorical hues for top payee slices — not brand primary / indigo family.
 * @see docs/specs/2026-05-30-analytics-insights-design.md (Block 3)
 */
export const COUNTERPARTY_DONUT_SLICE_COLORS = charts.payeeSliceColors;

export const COUNTERPARTY_DONUT_OTHER_COLOR = charts.payeeOther;
