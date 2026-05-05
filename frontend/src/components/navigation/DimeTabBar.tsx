import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { BarChart2, House, Settings } from "lucide-react-native";
import { useCallback, useContext, useEffect } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { fontFamilies } from "@/constants/fonts";
import { colors, spacing, typography } from "@/constants/theme";

const TAB_ICON_SIZE = spacing.iconTab;
const COLOR_TRANSITION_MS = 220;
const INDICATOR_LINE_HEIGHT = 3;

const ROUTE_ICONS = {
  Home: House,
  Analytics: BarChart2,
  Settings: Settings,
} as const;

type RouteName = keyof typeof ROUTE_ICONS;

function isRouteName(name: string): name is RouteName {
  return name in ROUTE_ICONS;
}

function tabLabel(
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

type TabItemProps = {
  routeName: string;
  label: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

function TabItem({
  routeName,
  label,
  isFocused,
  onPress,
  onLongPress,
}: TabItemProps) {
  const tabText =
    typeof label === "string" && label.trim().length > 0
      ? label
      : routeName || "Tab";
  const progress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(isFocused ? 1 : 0, {
      duration: COLOR_TRANSITION_MS,
    });
  }, [isFocused, progress]);

  const activeIconStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  const inactiveIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));

  const activeLabelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  const inactiveLabelStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));

  /** Horizontal line grows from center (scaleX 0 → 1). */
  const indicatorLineStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

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
      <View style={styles.lineDock} pointerEvents="none">
        <Animated.View style={[styles.indicatorLine, indicatorLineStyle]} />
      </View>

      <View style={styles.tabItemBody}>
        <View style={styles.iconStack}>
          <Animated.View style={[styles.iconLayer, inactiveIconStyle]}>
            <Icon
              size={TAB_ICON_SIZE}
              color={colors.textSecondary}
              strokeWidth={1.5}
            />
          </Animated.View>
          <Animated.View style={[styles.iconLayer, activeIconStyle]}>
            <Icon
              size={TAB_ICON_SIZE}
              color={colors.primary}
              strokeWidth={1.5}
            />
          </Animated.View>
        </View>

        <View style={styles.labelStack}>
          <Animated.View style={[styles.labelLayer, inactiveLabelStyle]}>
            <Text style={[styles.tabLabelBase, styles.labelInactive]}>
              {tabText}
            </Text>
          </Animated.View>
          <Animated.View style={[styles.labelLayer, activeLabelStyle]}>
            <Text style={[styles.tabLabelBase, styles.labelActive]}>
              {tabText}
            </Text>
          </Animated.View>
        </View>
      </View>
    </Pressable>
  );
}

export function DimeTabBar({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps) {
  const bottomPad = Math.max(insets.bottom, spacing.sm);
  const tabBarTotalHeight = spacing.tabBarHeight + bottomPad;
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);

  const onBarLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onTabBarHeightChange?.(event.nativeEvent.layout.height);
    },
    [onTabBarHeightChange],
  );

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: bottomPad,
          minHeight: tabBarTotalHeight,
        },
      ]}
      onLayout={onBarLayout}
    >
      <View style={styles.tabsRow}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label = tabLabel(options, route.name);

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <TabItem
              key={route.key}
              routeName={route.name}
              label={label}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: "100%",
    backgroundColor: colors.barBackground,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  tabsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    flex: 1,
    paddingTop: 0,
  },
  tabItem: {
    flex: 1,
    position: "relative",
    alignItems: "center",
    justifyContent: "flex-start",
    minHeight: 48,
  },
  /** Sits on the top hairline: nudge up so the line meets the border edge. */
  lineDock: {
    position: "absolute",
    top: -StyleSheet.hairlineWidth,
    left: 0,
    right: 0,
    height: INDICATOR_LINE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  tabItemBody: {
    width: "100%",
    alignItems: "center",
    paddingTop: INDICATOR_LINE_HEIGHT + spacing.sm,
  },
  indicatorLine: {
    height: INDICATOR_LINE_HEIGHT,
    width: "72%",
    maxWidth: 56,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  iconStack: {
    width: TAB_ICON_SIZE + 8,
    height: TAB_ICON_SIZE + 4,
    alignItems: "center",
    justifyContent: "center",
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  labelStack: {
    marginTop: 2,
    height: typography.tabLabel.lineHeight + 6,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  labelLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 2,
  },
  tabLabelBase: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  labelInactive: {
    fontFamily: fontFamilies.medium,
    color: colors.textSecondary,
  },
  labelActive: {
    fontFamily: fontFamilies.medium,
    color: colors.primary,
  },
});
