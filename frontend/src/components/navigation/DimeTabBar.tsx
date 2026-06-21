import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { Camera, Edit3, Mic, Plus } from "lucide-react-native";
import { useCallback, useContext, useEffect, useRef } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ink, line, surface } from "@/constants/colors";
import { fabIdleCloseMs, springs } from "@/constants/motion";
import { radius } from "@/constants/radius";
import { shadows } from "@/constants/shadows";
import { spacing } from "@/constants/spacing";
import { useReceiptCameraTransaction } from "@/features/transactions/hooks/useReceiptCameraTransaction";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

import { DimeTabBarItem } from "./DimeTabBarItem";
import {
  ACTION_BUBBLE_SIZE,
  ACTION_PLUS_ICON_SIZE,
  ACTIVE_BUBBLE_SIZE,
  OPTION_BUBBLE_SIZE,
  tabLabel,
} from "./dimeTabBarConfig";

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
}: BottomTabBarProps & {
  onFirstLayout?: () => void;
  onManualAddPress: () => void;
}) {
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

  // ── FAB ──────────────────────────────────────────────────────────────────
  const plusRotationDeg = useSharedValue(0);
  const actionsProgress = useSharedValue(0);
  const idleCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fabOpen = useAddTransactionFabStore((s) => s.fabOpen);
  const toggleFab = useAddTransactionFabStore((s) => s.toggleFab);
  const setFabOpen = useAddTransactionFabStore((s) => s.setFabOpen);
  const captureReceiptAndCreate = useReceiptCameraTransaction();
  const openVoiceCapture = useVoiceCaptureUiStore((s) => s.open);

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
      plusRotationDeg.value = withSpring(45, springs.fabOpen);
      actionsProgress.value = withSpring(1, springs.fabActions);
      return;
    }

    plusRotationDeg.value = withSpring(0, springs.fabOpen);
    actionsProgress.value = withSpring(0, springs.fabActions);
  }, [actionsProgress, fabOpen, plusRotationDeg]);

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

  // ── FAB animated styles ──────────────────────────────────────────────────
  const plusIconRotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${plusRotationDeg.value}deg` }],
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
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <DimeTabBarItem
              key={route.key}
              routeName={route.name}
              label={label}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}

        {/* Central FAB slot */}
        <View style={styles.centerPlusSlot}>
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
            style={({ pressed }) => [
              styles.centerFab,
              pressed && styles.centerFabPressed,
            ]}
          >
            <Animated.View style={plusIconRotationStyle}>
              <Plus
                size={ACTION_PLUS_ICON_SIZE}
                color={surface}
                strokeWidth={2.5}
              />
            </Animated.View>
          </Pressable>
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
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <DimeTabBarItem
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

      {/* Radial action bubbles */}
      <View
        pointerEvents={fabOpen ? "box-none" : "none"}
        style={styles.actionsRow}
      >
        <Animated.View style={[styles.actionBubble, manualActionStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add transaction manually"
            disabled={!fabOpen}
            hitSlop={{ top: 20, bottom: 20, left: 64, right: 20 }}
            onPressIn={bumpFabIdleTimer}
            onPress={() => {
              void triggerLightHaptic();
              setFabOpen(false);
              onManualAddPress();
            }}
            style={styles.radialActionHit}
          >
            <Edit3 size={20} color={surface} strokeWidth={2} />
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.actionBubble, photoActionStyle]}>
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
            <Camera size={20} color={surface} strokeWidth={2} />
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.actionBubble, voiceActionStyle]}>
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
            <Mic size={20} color={surface} strokeWidth={2} />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: "100%",
    backgroundColor: surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: line,
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
    backgroundColor: surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: line,
    ...shadows.tabIndicator,
    zIndex: 0,
  },
  centerPlusSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  centerFab: {
    marginTop: -(ACTION_BUBBLE_SIZE / 2),
    width: ACTION_BUBBLE_SIZE,
    height: ACTION_BUBBLE_SIZE,
    borderRadius: ACTION_BUBBLE_SIZE / 2,
    backgroundColor: ink,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 8,
    ...shadows.fab,
  },
  centerFabPressed: {
    opacity: 0.85,
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
    backgroundColor: ink,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.fab,
  },
  radialActionHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
