import { Platform, type ViewStyle } from "react-native";

import { shadow } from "./colors";

/**
 * Elevation tokens — Dime Monochrome Design System.
 *
 * All shadows use neutral black, NOT the brand indigo.
 * Cards are separated from the near-white background through
 * diffuse ambient shadows only — never borders.
 *
 * @see docs/design-system.md §4
 */

// ─── iOS shadow definitions ───────────────────────────────────────────────────

const cardIos: ViewStyle = {
  shadowColor: shadow,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
};

const cardElevatedIos: ViewStyle = {
  shadowColor: shadow,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
};

const headerIos: ViewStyle = {
  shadowColor: shadow,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
};

const sheetIos: ViewStyle = {
  shadowColor: shadow,
  shadowOffset: { width: 0, height: -2 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
};

const toastIos: ViewStyle = {
  shadowColor: shadow,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 12,
};

const fabIos: ViewStyle = {
  shadowColor: shadow,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.18,
  shadowRadius: 12,
};

/** Active tab floating orb — white disc lifted off the white tab bar. */
const tabIndicatorIos: ViewStyle = {
  shadowColor: shadow,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 8,
};

// ─── Exported shadow tokens ───────────────────────────────────────────────────

export const shadows = {
  /** Standard white card on #FAFAFA background. */
  card: Platform.select({
    android: { elevation: 2 },
    default: cardIos,
  }) as ViewStyle,

  /** Slightly stronger — hero card, primary content area. */
  cardElevated: Platform.select({
    android: { elevation: 4 },
    default: cardElevatedIos,
  }) as ViewStyle,

  /** App header and tab bar — very subtle lift from page. */
  header: Platform.select({
    android: { elevation: 2 },
    default: headerIos,
  }) as ViewStyle,

  /** Bottom sheets and drawers — upward shadow. */
  sheet: Platform.select({
    android: { elevation: 6 },
    default: sheetIos,
  }) as ViewStyle,

  /** Toast notifications. */
  toast: Platform.select({
    android: { elevation: 6 },
    default: toastIos,
  }) as ViewStyle,

  /** FAB and action bubbles. */
  fab: Platform.select({
    android: { elevation: 8 },
    default: fabIos,
  }) as ViewStyle,

  /** Active tab orb — stronger than card so white-on-white reads clearly. */
  tabIndicator: Platform.select({
    android: { elevation: 10 },
    default: tabIndicatorIos,
  }) as ViewStyle,

  /** @deprecated alias for `card` — kept for migration */
  postcard: Platform.select({
    android: { elevation: 4 },
    default: cardElevatedIos,
  }) as ViewStyle,

  /** @deprecated alias for `fab` — kept for migration */
  hero: Platform.select({
    android: { elevation: 8 },
    default: fabIos,
  }) as ViewStyle,
} as const;
