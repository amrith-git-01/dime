/**
 * Named layout dimensions not on the 4dp spacing scale.
 * @see docs/superpowers/specs/2026-05-31-frontend-dry-architecture-design.md
 */

export const bentoTileMinHeight = {
  homeSpendRow: 168,
  homeCategory: 112,
  homeIncome: 92,
  homeRecent: 64,
} as const;

export const budgetRowHeight = {
  withProgress: 58,
  spentOnly: 46,
} as const;
