/**
 * Border radius scale — Dime Monochrome Design System.
 *
 * Strict 4-value ladder + pill:
 *   sm  → chips, tags, small elements
 *   md  → inputs, secondary cards, strips
 *   lg  → primary cards, hero card, transaction list card
 *   xl  → bottom sheets, modals (top corners only)
 *   full → pills, avatars, FAB, day-cell circles
 *
 * @see docs/design-system.md §5
 */
export const radius = {
  /** 10 — chips, small tags, icon tiles */
  sm: 10,
  /** 16 — inputs, slim cards, daily cap strip */
  md: 16,
  /** 24 — primary content cards (hero, transaction list) */
  lg: 24,
  /** 32 — hero card, large modal cards */
  xl: 32,
  /** 9999 — pills, avatars, FAB, progress bars, day-cell circles */
  full: 9999,
  /** @deprecated alias for sm — kept for migration */
  xs: 6,
  /** @deprecated alias for lg — kept for migration */
  hero: 22,
  /** @deprecated alias for md — kept for migration */
  stat: 16,
  /** @deprecated alias for xl — kept for migration */
  x2l: 32,
} as const;

export type RadiusToken = keyof typeof radius;
