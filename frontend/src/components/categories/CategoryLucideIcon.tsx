import type { LucideProps } from "lucide-react-native";
import {
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Building,
  Bus,
  Car,
  ChartLine,
  CirclePlus,
  Clapperboard,
  CreditCard,
  CupSoda,
  Dog,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Package,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Repeat,
  Shield,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Tag,
  TrendingUp,
  UtensilsCrossed,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react-native";
import type { ComponentType } from "react";
import { memo } from "react";

import { readableCategoryColor } from "@/constants/colorUtils";
import { useTheme } from "@/theme";

const DEFAULT_ICON = Package;

type IconComponent = ComponentType<LucideProps>;

const ICON_BY_NAME: Record<string, IconComponent> = {
  CupSoda,
  Plane,
  Bus,
  Landmark,
  Fuel,
  UtensilsCrossed,
  Banknote,
  TrendingUp,
  Zap,
  Clapperboard,
  CreditCard,
  HeartPulse,
  Package,
  House,
  Pill,
  PiggyBank,
  Car,
  ShoppingBasket,
  ShoppingBag,
  GraduationCap,
  Shield,
  ChartLine,
  ArrowLeftRight,
  Gift,
  Sparkles,
  Dog,
  Receipt,
  Wrench,
  Tag,
};

/**
 * Icons of the system recurring categories (Subscriptions, Internet & phone, Salary ...). They render everywhere but
 * stay out of the custom-category icon picker, which lists `CATEGORY_LUCIDE_ICON_NAMES`.
 */
const RECURRING_ICON_BY_NAME: Record<string, IconComponent> = {
  Repeat,
  Wifi,
  Briefcase,
  Laptop,
  Building,
  CirclePlus,
};

export const CATEGORY_LUCIDE_ICON_NAMES = Object.keys(
  ICON_BY_NAME,
) as (keyof typeof ICON_BY_NAME)[];

export type CategoryLucideIconProps = {
  iconName: string;
  color: string;
  size?: number;
  strokeWidth?: number;
};

export const CategoryLucideIcon = memo(function CategoryLucideIcon({
  iconName,
  color,
  size = 20,
  strokeWidth = 1.5,
}: CategoryLucideIconProps) {
  const { scheme } = useTheme();
  const Icon =
    ICON_BY_NAME[iconName] ?? RECURRING_ICON_BY_NAME[iconName] ?? DEFAULT_ICON;
  return (
    <Icon
      width={size}
      height={size}
      color={readableCategoryColor(color, scheme)}
      strokeWidth={strokeWidth}
    />
  );
});
