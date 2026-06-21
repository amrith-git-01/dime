import { House } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ink, inkFaint } from "@/constants/colors";
import { springs } from "@/constants/motion";

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
  const Icon = isRouteName(routeName) ? ROUTE_ICONS[routeName] : House;
  const a11yLabel =
    typeof label === "string" && label.trim() ? label : routeName || "Tab";

  // Spring scale: active tab icon grows slightly.
  const scale = useSharedValue(isFocused ? 1.08 : 1.0);
  useEffect(() => {
    scale.value = withSpring(isFocused ? 1.08 : 1.0, springs.snappy);
  }, [isFocused, scale]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
    >
      {/* orb is a fixed-size hit region; background provided by the sliding indicator */}
      <Animated.View style={[styles.orb, iconStyle]}>
        <Icon
          size={TAB_ICON_SIZE}
          color={isFocused ? ink : inkFaint}
          strokeWidth={isFocused ? 2 : 1.5}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    zIndex: 1,
  },
  pressed: {
    opacity: 0.65,
  },
  orb: {
    width: ACTIVE_BUBBLE_SIZE,
    height: ACTIVE_BUBBLE_SIZE,
    borderRadius: ACTIVE_BUBBLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
