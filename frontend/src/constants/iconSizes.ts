/** Lucide icon sizes — design system §1.7 */
export const iconSizes = {
  inline: 16,
  nav: 20,
  prominent: 24,
  empty: 32,
  quickAdd: 13,
} as const;

export type IconSizeToken = keyof typeof iconSizes;
