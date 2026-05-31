/** Border radius scale — design system §1.6 */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  x2l: 32,
  hero: 22,
  stat: 16,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radius;
