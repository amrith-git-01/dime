import type { LucideProps } from "lucide-react-native";
import {
  ArrowLeftRight,
  Banknote,
  Bus,
  Car,
  ChartLine,
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
  Package,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Shield,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Tag,
  TrendingUp,
  UtensilsCrossed,
  Wrench,
  Zap,
} from "lucide-react-native";
import type { ComponentType } from "react";
import { memo } from "react";

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
  const Icon = ICON_BY_NAME[iconName] ?? DEFAULT_ICON;
  return (
    <Icon width={size} height={size} color={color} strokeWidth={strokeWidth} />
  );
});
