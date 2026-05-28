import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import {
  ArrowLeftRight,
  Camera,
  ChartBar,
  Edit3,
  House,
  Mic,
  Plus,
  Target,
} from "lucide-react-native";
import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import {
  fabBreathe,
  fabIdleCloseMs,
  springs,
  timings,
} from "@/constants/motion";
import { colors, radius, spacing } from "@/constants/theme";
import { useReceiptCameraTransaction } from "@/features/transactions/hooks/useReceiptCameraTransaction";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import {
  clearPendingNavigationCallback,
  invokePendingNavigationCallback,
  registerFabAnimationDriver,
  setPendingNavigationCallback,
  useAddTransactionFabStore,
} from "@/stores/addTransactionFabStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

const TAB_ICON_SIZE = 22;
const ACTIVE_ICON_SIZE = 24;
const ACTIVE_BUBBLE_SIZE = 44;
const ACTION_BUBBLE_SIZE = 64;
const ACTION_PLUS_ICON_SIZE = 30;
const OPTION_BUBBLE_SIZE = 44;
const LIQUID_PILL_WIDTH = 56;
const LIQUID_PILL_HEIGHT = 30;
const NOTCH_CUTOUT_SIZE = 52;
const TOTAL_NAV_SLOTS = 5;

const ROUTE_ICONS = {
  Home: House,
  Transactions: ArrowLeftRight,
  Budgets: Target,
  Insights: ChartBar,
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

export function DimeTabBar({
  state,
  descriptors,
  navigation,
  insets,
  onFirstLayout,
  onManualAddPress,
}: BottomTabBarProps & {
  onFirstLayout?: () => void;
  onManualAddPress: () => void;
}) {
  const bottomPad = Math.max(insets.bottom, spacing.xs);
  const tabBarTotalHeight = spacing.tabBarHeight + bottomPad;
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const firstLayoutNotifiedRef = useRef(false);
  const barWidth = useSharedValue(0);
  const activeCenterX = useSharedValue(0);
  const travelMorph = useSharedValue(0);
  const activeLift = useSharedValue(0);
  const plusRotationDeg = useSharedValue(0);
  const actionsProgress = useSharedValue(0);
  const fabBreatheScale = useSharedValue<number>(fabBreathe.scaleMin);
  const idleCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fabOpen = useAddTransactionFabStore((s) => s.fabOpen);
  const toggleFab = useAddTransactionFabStore((s) => s.toggleFab);
  const setFabOpen = useAddTransactionFabStore((s) => s.setFabOpen);
  const captureReceiptAndCreate = useReceiptCameraTransaction();
  const openVoiceCapture = useVoiceCaptureUiStore((s) => s.open);

  const activeRouteName = state.routes[state.index]?.name;
  const ActiveIcon = useMemo(
    () => (isRouteName(activeRouteName) ? ROUTE_ICONS[activeRouteName] : House),
    [activeRouteName],
  );

  useEffect(() => {
    if (barWidth.value <= 0 || state.routes.length <= 0) {
      return;
    }

    const slotWidth = barWidth.value / TOTAL_NAV_SLOTS;
    const activeSlotIndex = state.index < 2 ? state.index : state.index + 1;
    const targetCenter = slotWidth * activeSlotIndex + slotWidth / 2;

    activeCenterX.value = withSpring(targetCenter, springs.tabIndicator);
    activeLift.value = withSequence(
      withTiming(-4, timings.tabTravelUp),
      withTiming(0, timings.tabTravelDown),
    );
    travelMorph.value = withSequence(
      withTiming(1, timings.tabTravelUp),
      withTiming(0, timings.tabTravelDown),
    );
  }, [
    activeCenterX,
    activeLift,
    barWidth,
    state.index,
    state.routes.length,
    travelMorph,
  ]);

  useEffect(() => {
    registerFabAnimationDriver({
      requestClose: (onComplete) => {
        setPendingNavigationCallback(onComplete);
        setFabOpen(false);
      },
    });
    return () => {
      registerFabAnimationDriver(null);
      clearPendingNavigationCallback();
    };
  }, [setFabOpen]);

  const clearFabIdleTimer = useCallback(() => {
    if (idleCloseTimerRef.current) {
      clearTimeout(idleCloseTimerRef.current);
      idleCloseTimerRef.current = null;
    }
  }, []);

  const scheduleFabIdleClose = useCallback(() => {
    clearFabIdleTimer();
    idleCloseTimerRef.current = setTimeout(() => {
      idleCloseTimerRef.current = null;
      if (useAddTransactionFabStore.getState().fabOpen) {
        setFabOpen(false);
      }
    }, fabIdleCloseMs);
  }, [clearFabIdleTimer, setFabOpen]);

  const bumpFabIdleTimer = useCallback(() => {
    if (useAddTransactionFabStore.getState().fabOpen) {
      scheduleFabIdleClose();
    }
  }, [scheduleFabIdleClose]);

  useEffect(() => {
    if (!fabOpen) {
      clearFabIdleTimer();
      return;
    }
    scheduleFabIdleClose();
    return clearFabIdleTimer;
  }, [fabOpen, scheduleFabIdleClose, clearFabIdleTimer]);

  useEffect(() => {
    if (fabOpen) {
      cancelAnimation(fabBreatheScale);
      fabBreatheScale.value = withSpring(fabBreathe.scaleMin, springs.snappy);
      return;
    }

    fabBreatheScale.value = withRepeat(
      withSequence(
        withTiming(fabBreathe.scaleMax, {
          duration: fabBreathe.halfCycleMs,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(fabBreathe.scaleMin, {
          duration: fabBreathe.halfCycleMs,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    );
  }, [fabOpen, fabBreatheScale]);

  useEffect(() => {
    if (fabOpen) {
      clearPendingNavigationCallback();
      plusRotationDeg.value = withSpring(45, springs.fabOpen);
      actionsProgress.value = withSpring(1, springs.fabActions);
      return;
    }

    plusRotationDeg.value = withSpring(0, springs.fabOpen);
    actionsProgress.value = withSpring(0, springs.fabActions, (finished) => {
      if (finished) {
        runOnJS(invokePendingNavigationCallback)();
      }
    });
  }, [actionsProgress, fabOpen, plusRotationDeg]);

  const onBarLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      barWidth.value = width;

      const slotWidth = width / TOTAL_NAV_SLOTS;
      const activeSlotIndex = state.index < 2 ? state.index : state.index + 1;
      activeCenterX.value = slotWidth * activeSlotIndex + slotWidth / 2;
      onTabBarHeightChange?.(height);
      if (!firstLayoutNotifiedRef.current && width > 0 && height > 0) {
        firstLayoutNotifiedRef.current = true;
        onFirstLayout?.();
      }
    },
    [
      activeCenterX,
      barWidth,
      onFirstLayout,
      onTabBarHeightChange,
      state.index,
      state.routes.length,
    ],
  );

  const liquidPillStyle = useAnimatedStyle(() => {
    const scaleX = interpolate(travelMorph.value, [0, 1], [1, 1.28]);
    const scaleY = interpolate(travelMorph.value, [0, 1], [1, 0.9]);

    return {
      transform: [
        { translateX: activeCenterX.value - LIQUID_PILL_WIDTH / 2 },
        { scaleX },
        { scaleY },
      ],
    };
  });

  const notchCutoutStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: activeCenterX.value - NOTCH_CUTOUT_SIZE / 2 }],
  }));

  const floatingOrbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: activeCenterX.value - ACTIVE_BUBBLE_SIZE / 2 },
      { translateY: activeLift.value },
    ],
  }));

  const plusIconRotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${plusRotationDeg.value}deg` }],
  }));

  const centerFabBreatheStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabBreatheScale.value }],
  }));

  const manualActionStyle = useAnimatedStyle(() => ({
    opacity: actionsProgress.value,
    transform: [
      { translateX: interpolate(actionsProgress.value, [0, 1], [0, -52]) },
      { translateY: interpolate(actionsProgress.value, [0, 1], [12, -38]) },
      { scale: interpolate(actionsProgress.value, [0, 1], [0.92, 1]) },
    ],
  }));

  const photoActionStyle = useAnimatedStyle(() => ({
    opacity: actionsProgress.value,
    transform: [
      { translateY: interpolate(actionsProgress.value, [0, 1], [12, -58]) },
      { scale: interpolate(actionsProgress.value, [0, 1], [0.92, 1]) },
    ],
  }));

  const voiceActionStyle = useAnimatedStyle(() => ({
    opacity: actionsProgress.value,
    transform: [
      { translateX: interpolate(actionsProgress.value, [0, 1], [0, 52]) },
      { translateY: interpolate(actionsProgress.value, [0, 1], [12, -38]) },
      { scale: interpolate(actionsProgress.value, [0, 1], [0.92, 1]) },
    ],
  }));

  const toggleAddFab = useCallback(() => {
    void triggerLightHaptic();
    toggleFab();
  }, [toggleFab]);

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
      <Animated.View
        pointerEvents="none"
        style={[styles.notchCutout, notchCutoutStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.liquidPill, liquidPillStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.floatingOrb, floatingOrbStyle]}
      >
        <ActiveIcon
          size={ACTIVE_ICON_SIZE}
          color={colors.headerGradientStart}
          strokeWidth={2}
        />
      </Animated.View>
      <View style={styles.tabsRow}>
        {state.routes.slice(0, 2).map((route, index) => {
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
        <View style={styles.centerPlusSlot}>
          <Animated.View style={centerFabBreatheStyle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                fabOpen ? "Close add transaction" : "Add transaction"
              }
              accessibilityState={{ expanded: fabOpen }}
              onPress={toggleAddFab}
              onPressIn={bumpFabIdleTimer}
              hitSlop={10}
              pressRetentionOffset={12}
              style={styles.centerPlusButton}
            >
              <Animated.View style={plusIconRotationStyle}>
                <Plus
                  size={ACTION_PLUS_ICON_SIZE}
                  color={colors.headerGradientStart}
                  strokeWidth={2}
                />
              </Animated.View>
            </Pressable>
          </Animated.View>
        </View>
        {state.routes.slice(2).map((route, offset) => {
          const index = offset + 2;
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
      {/* Render after tabs so + stays in normal order; zIndex + hitSlop reach fanned bubbles outside 44×44 (Android). */}
      <View
        pointerEvents={fabOpen ? "box-none" : "none"}
        style={styles.actionsRow}
      >
        <Animated.View
          style={[
            styles.actionBubble,
            styles.actionBubbleLeft,
            manualActionStyle,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add transaction manually"
            disabled={!fabOpen}
            hitSlop={{ top: 20, bottom: 20, left: 64, right: 20 }}
            onPressIn={bumpFabIdleTimer}
            onPress={() => {
              void triggerLightHaptic();
              useAddTransactionFabStore.getState().closeForNavigation(() => {
                onManualAddPress();
              });
            }}
            style={styles.radialActionHit}
          >
            <Edit3
              size={20}
              color={colors.headerGradientStart}
              strokeWidth={2}
            />
          </Pressable>
        </Animated.View>
        <Animated.View
          style={[
            styles.actionBubble,
            styles.actionBubbleCenter,
            photoActionStyle,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add transaction from photo"
            disabled={!fabOpen}
            hitSlop={{ top: 56, bottom: 4, left: 20, right: 20 }}
            onPressIn={bumpFabIdleTimer}
            onPress={() => {
              void triggerLightHaptic();
              setFabOpen(false);
              void captureReceiptAndCreate();
            }}
            style={styles.radialActionHit}
          >
            <Camera
              size={20}
              color={colors.headerGradientStart}
              strokeWidth={2}
            />
          </Pressable>
        </Animated.View>
        <Animated.View
          style={[
            styles.actionBubble,
            styles.actionBubbleRight,
            voiceActionStyle,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add transaction with voice"
            disabled={!fabOpen}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 64 }}
            onPressIn={bumpFabIdleTimer}
            onPress={() => {
              void triggerLightHaptic();
              setFabOpen(false);
              openVoiceCapture();
            }}
            style={styles.radialActionHit}
          >
            <Mic size={20} color={colors.headerGradientStart} strokeWidth={2} />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: "100%",
    backgroundColor: colors.headerGradientStart,
    borderTopWidth: 1,
    borderTopColor: colors.onPrimaryHairline,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: "visible",
  },
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    flex: 1,
    paddingHorizontal: spacing.sm,
    overflow: "visible",
    zIndex: 2,
  },
  notchCutout: {
    position: "absolute",
    top: -26,
    width: NOTCH_CUTOUT_SIZE,
    height: NOTCH_CUTOUT_SIZE,
    borderRadius: NOTCH_CUTOUT_SIZE / 2,
    backgroundColor: colors.pageBackground,
    zIndex: 1,
  },
  liquidPill: {
    position: "absolute",
    top: 6,
    width: LIQUID_PILL_WIDTH,
    height: LIQUID_PILL_HEIGHT,
    borderRadius: LIQUID_PILL_HEIGHT / 2,
    backgroundColor: "transparent",
    zIndex: 1,
  },
  floatingOrb: {
    position: "absolute",
    top: -21,
    width: ACTIVE_BUBBLE_SIZE,
    height: ACTIVE_BUBBLE_SIZE,
    borderRadius: ACTIVE_BUBBLE_SIZE / 2,
    backgroundColor: colors.barBackground,
    borderWidth: 3,
    borderColor: colors.headerGradientEnd,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
    shadowColor: colors.headerGradientStart,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  centerPlusButton: {
    marginTop: -(ACTION_BUBBLE_SIZE / 2),
    width: ACTION_BUBBLE_SIZE,
    height: ACTION_BUBBLE_SIZE,
    borderRadius: ACTION_BUBBLE_SIZE / 2,
    backgroundColor: colors.barBackground,
    borderWidth: 3,
    borderColor: colors.headerGradientEnd,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 8,
    shadowColor: colors.headerGradientStart,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  centerPlusSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  actionsRow: {
    position: "absolute",
    bottom: ACTION_BUBBLE_SIZE - 14,
    left: "50%",
    marginLeft: -(OPTION_BUBBLE_SIZE / 2),
    width: OPTION_BUBBLE_SIZE,
    height: OPTION_BUBBLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  actionBubble: {
    position: "absolute",
    width: OPTION_BUBBLE_SIZE,
    height: OPTION_BUBBLE_SIZE,
    borderRadius: OPTION_BUBBLE_SIZE / 2,
    backgroundColor: colors.barBackground,
    borderWidth: 3,
    borderColor: colors.headerGradientEnd,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.headerGradientStart,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  actionBubbleLeft: {},
  actionBubbleCenter: {},
  actionBubbleRight: {},
  /** Minimum touch target inside the 44×44 bubble (icon alone is too small on Android). */
  radialActionHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
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
