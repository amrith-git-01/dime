/** 4dp base unit — design system §1.6 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  tabBarHeight: 48,
  iconTab: 22,
  headerCurveRadius: 24,
} as const;

export type SpacingToken = keyof typeof spacing;
