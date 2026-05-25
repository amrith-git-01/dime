/** Lucide icon names supported by `CategoryLucideIcon`. */
export const CUSTOM_CATEGORY_ICON_OPTIONS = [
  "UtensilsCrossed",
  "Bus",
  "Car",
  "ShoppingBag",
  "HeartPulse",
  "Clapperboard",
  "Zap",
  "Plane",
  "GraduationCap",
  "TrendingUp",
  "Package",
  "Dog",
  "Gift",
  "Sparkles",
  "CupSoda",
  "Fuel",
  "House",
  "Pill",
  "Shield",
  "Wrench",
] as const;

export type CustomCategoryIconName =
  (typeof CUSTOM_CATEGORY_ICON_OPTIONS)[number];

/** Design-system category palette plus extended picks for custom categories. */
export const CUSTOM_CATEGORY_COLOR_OPTIONS = [
  "#FF6B6B",
  "#4ECDC4",
  "#A855F7",
  "#4ADE80",
  "#FB923C",
  "#FBBF24",
  "#818CF8",
  "#F472B6",
  "#34D399",
  "#94A3B8",
  "#6355E8",
  "#EF4444",
  "#0EA5E9",
  "#14B8A6",
  "#84CC16",
  "#EC4899",
  "#6366F1",
  "#78716C",
] as const;

export const DEFAULT_CUSTOM_CATEGORY_ICON: CustomCategoryIconName =
  CUSTOM_CATEGORY_ICON_OPTIONS[0];
export const DEFAULT_CUSTOM_CATEGORY_COLOR = CUSTOM_CATEGORY_COLOR_OPTIONS[0];
