import { ArrowLeftRight, ChartBar, House, Target } from "lucide-react-native";

import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { spacing } from "@/constants/spacing";

export const TAB_ICON_SIZE = 22;
export const ACTIVE_ICON_SIZE = 22;
export const ACTIVE_BUBBLE_SIZE = 44;
export const ACTION_BUBBLE_SIZE = 60;
export const ACTION_PLUS_ICON_SIZE = 26;
export const OPTION_BUBBLE_SIZE = 44;
export const LIQUID_PILL_WIDTH = 44;
export const LIQUID_PILL_HEIGHT = 44;
export const TOTAL_NAV_SLOTS = 5;

/**
 * Vertical center of the "+" FAB, measured from the top of the tab bar. The FAB is pulled up by half its size
 * (DimeTabBarFab marginTop) and its slot is centered in the tabs row, so it sits at the same place whatever the
 * system navigation inset below the bar is.
 */
export const FAB_CENTER_Y = (spacing.tabBarHeight - ACTION_BUBBLE_SIZE / 2) / 2;

/** What the radial add-transaction menu shows for a limited option (receipt photo, voice). */
export type FabCaptureOption = {
  /** Daily allowance used up or capture paused: option is dimmed and explains itself on tap. */
  blocked: boolean;
  /** Small count badge on the bubble, e.g. "7"; null while the allowance is unknown. */
  badge: string | null;
  /** Full copy for the accessibility label and the tap-while-blocked message. */
  caption: string;
  blockedMessage: string;
};

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
