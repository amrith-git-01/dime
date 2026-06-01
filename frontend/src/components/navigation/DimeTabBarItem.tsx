import { House } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { colors } from "@/constants";

import {
  ACTIVE_BUBBLE_SIZE,
  ROUTE_ICONS,
  TAB_ICON_SIZE,
  isRouteName,
} from "./dimeTabBarConfig";

type DimeTabBarItemProps = {
  routeName: string;
  label: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

export function DimeTabBarItem({
  routeName,
  label,
  isFocused,
  onPress,
  onLongPress,
}: DimeTabBarItemProps) {
  const tabText =
    typeof label === "string" && label.trim().length > 0
      ? label
      : routeName || "Tab";

  const Icon = isRouteName(routeName) ? ROUTE_ICONS[routeName] : House;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={tabText}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tabItem}
    >
      <View style={styles.tabItemBody}>
        <View style={styles.iconStack}>
          <Icon
            size={TAB_ICON_SIZE}
            color={isFocused ? "transparent" : colors.tabBarOnPrimaryInactive}
            strokeWidth={1.7}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    flex: 1,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
  },
  tabItemBody: {
    width: "100%",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconStack: {
    width: ACTIVE_BUBBLE_SIZE,
    height: ACTIVE_BUBBLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
});
