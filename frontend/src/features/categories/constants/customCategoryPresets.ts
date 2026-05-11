import { customCategoryColorOptions } from "@/constants";

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
export const CUSTOM_CATEGORY_COLOR_OPTIONS = customCategoryColorOptions;

export const DEFAULT_CUSTOM_CATEGORY_ICON: CustomCategoryIconName =
  CUSTOM_CATEGORY_ICON_OPTIONS[0];
export const DEFAULT_CUSTOM_CATEGORY_COLOR = CUSTOM_CATEGORY_COLOR_OPTIONS[0];
