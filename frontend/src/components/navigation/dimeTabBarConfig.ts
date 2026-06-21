import { ArrowLeftRight, ChartBar, House, Target } from "lucide-react-native";

import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

export const TAB_ICON_SIZE = 22;
export const ACTIVE_ICON_SIZE = 22;
export const ACTIVE_BUBBLE_SIZE = 44;
export const ACTION_BUBBLE_SIZE = 60;
export const ACTION_PLUS_ICON_SIZE = 26;
export const OPTION_BUBBLE_SIZE = 44;
export const LIQUID_PILL_WIDTH = 44;
export const LIQUID_PILL_HEIGHT = 44;
export const TOTAL_NAV_SLOTS = 5;

export const ROUTE_ICONS = {
  Home: House,
  Transactions: ArrowLeftRight,
  Budgets: Target,
  Insights: ChartBar,
} as const;

export type RouteName = keyof typeof ROUTE_ICONS;

export function isRouteName(name: string | undefined): name is RouteName {
  return typeof name === "string" && name in ROUTE_ICONS;
}

export function tabLabel(
  options: BottomTabBarProps["descriptors"][string]["options"],
  routeName: string,
): string {
  if (
    typeof options.tabBarLabel === "string" &&
    options.tabBarLabel.length > 0
  ) {
    return options.tabBarLabel;
  }
  if (typeof options.title === "string" && options.title.length > 0) {
    return options.title;
  }
  return routeName;
}
