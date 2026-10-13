import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { useCallback, useContext, useEffect, useRef } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { springs } from "@/constants/motion";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { useFabIdleClose } from "@/hooks/useFabIdleClose";

import { DimeTabBarFab } from "./DimeTabBarFab";
import { DimeTabBarFabActions } from "./DimeTabBarFabActions";
import { DimeTabBarRouteItem } from "./DimeTabBarRouteItem";
import { ACTIVE_BUBBLE_SIZE, type FabCaptureOption } from "./dimeTabBarConfig";
import { createThemedStyles } from "@/theme";

// ─── Indicator geometry ────────────────────────────────────────────────────
// 5 equal slots: [tab0] [tab1] [FAB] [tab2] [tab3]
// Route indices 0,1,2,3 map to visual slots 0,1,3,4.
const SLOT_MAP = [0, 1, 3, 4] as const;
const INDICATOR_SIZE = ACTIVE_BUBBLE_SIZE;
const INDICATOR_TOP = (spacing.tabBarHeight - INDICATOR_SIZE) / 2;

/** Compute the indicator's translateX so its center aligns with the tab slot. */
function indicatorTranslateX(routeIndex: number, bw: number): number {
  const pad = spacing.sm;
  const slotW = (bw - pad * 2) / 5;
  const slot = SLOT_MAP[routeIndex as 0 | 1 | 2 | 3] ?? 0;
  return pad + slotW * (slot + 0.5) - INDICATOR_SIZE / 2;
}

export function DimeTabBar({
  state,
  descriptors,
  navigation,
  insets,
  onFirstLayout,
  onManualAddPress,
  onCaptureReceiptPress,
  receiptOption,
  voiceOption,
  onBlockedOptionPress,
}: BottomTabBarProps & {
  onFirstLayout?: () => void;
  onManualAddPress: () => void;
  onCaptureReceiptPress: () => void;
  receiptOption?: FabCaptureOption;
  voiceOption?: FabCaptureOption;
  onBlockedOptionPress?: (message: string) => void;
}) {
  const styles = useStyles();
  const bottomPad = Math.max(insets.bottom, spacing.xs);
  const tabBarTotalHeight = spacing.tabBarHeight + bottomPad;
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const firstLayoutNotifiedRef = useRef(false);
  const activeIndexRef = useRef(state.index);

  // ── Bar width & indicator X ──────────────────────────────────────────────
  const barWidth = useSharedValue(0);
  const indicatorX = useSharedValue(-INDICATOR_SIZE); // off-screen until first layout

  // Slide indicator when active route changes.
  useEffect(() => {
    activeIndexRef.current = state.index;
    if (barWidth.value <= 0) return;
    indicatorX.value = withSpring(
      indicatorTranslateX(state.index, barWidth.value),
      springs.tabIndicator,
    );
  }, [state.index, barWidth, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    // Hide before first bar layout measurement.
    opacity: indicatorX.value < 0 ? 0 : 1,
  }));

  const bumpFabIdleTimer = useFabIdleClose();

  const onBarLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      barWidth.value = width;
      // Snap indicator to initial position without animation.
      indicatorX.value = indicatorTranslateX(activeIndexRef.current, width);
      onTabBarHeightChange?.(height);
      if (!firstLayoutNotifiedRef.current && width > 0 && height > 0) {
        firstLayoutNotifiedRef.current = true;
        onFirstLayout?.();
      }
    },
    [barWidth, indicatorX, onFirstLayout, onTabBarHeightChange],
  );

  // ── Render ────────────────────────────────────────────────────────────────
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
        {/* Sliding active indicator — renders behind all tab items */}
        <Animated.View
          pointerEvents="none"
          style={[styles.tabIndicator, indicatorStyle]}
        />

        {state.routes.slice(0, 2).map((route, index) => (
          <DimeTabBarRouteItem
            key={route.key}
            route={route}
            options={descriptors[route.key].options}
            isFocused={state.index === index}
            navigation={navigation}
          />
        ))}

        {/* Central FAB slot */}
        <DimeTabBarFab onPressIn={bumpFabIdleTimer} />

        {state.routes.slice(2).map((route, offset) => (
          <DimeTabBarRouteItem
            key={route.key}
            route={route}
            options={descriptors[route.key].options}
            isFocused={state.index === offset + 2}
            navigation={navigation}
          />
        ))}
      </View>

      {/* Radial action bubbles */}
      <DimeTabBarFabActions
        onManualAddPress={onManualAddPress}
        onCaptureReceiptPress={onCaptureReceiptPress}
        receiptOption={receiptOption}
        voiceOption={voiceOption}
        onBlockedOptionPress={onBlockedOptionPress}
        onPressIn={bumpFabIdleTimer}
      />
    </View>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  bar: {
    width: "100%",
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: "visible",
    ...shadows.header,
  },
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    height: spacing.tabBarHeight,
    paddingHorizontal: spacing.sm,
    overflow: "visible",
    zIndex: 2,
  },
  // Sliding indicator — white orb lifted by shadow (monochrome, no accent).
  tabIndicator: {
    position: "absolute",
    top: INDICATOR_TOP,
    left: 0,
    width: INDICATOR_SIZE,
    height: INDICATOR_SIZE,
    borderRadius: INDICATOR_SIZE / 2,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.tabIndicator,
    zIndex: 0,
  },
}));
