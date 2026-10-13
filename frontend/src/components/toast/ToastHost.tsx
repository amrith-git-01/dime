import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { springs } from "@/constants/motion";
import { useToastUiStore } from "@/stores/toastUiStore";

import type { ToastVariant } from "@/features/toast/types";
import { createThemedStyles, useTheme, type ThemeColors } from "@/theme";

const ENTER_OPACITY_MS = 140;
const EXIT_OPACITY_MS = 120;
const EXIT_Y_OFFSET = 18;
function variantConfig(variant: ToastVariant, colors: ThemeColors) {
  switch (variant) {
    case "success":
      return {
        icon: CheckCircle2,
        accent: colors.success,
      };
    case "error":
      return {
        icon: AlertCircle,
        accent: colors.toastErrorAccent,
      };
    case "warning":
      return {
        icon: AlertTriangle,
        accent: colors.toastWarningAccent,
      };
    case "info":
    default:
      return {
        icon: Info,
        accent: colors.accentText,
      };
  }
}

export function ToastHost() {
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToastUiStore((s) => s.current);
  const hideCurrent = useToastUiStore((s) => s.hideCurrent);
  const insets = useSafeAreaInsets();
  const [renderedToast, setRenderedToast] = useState(toast);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const finalizeDismiss = useCallback(() => {
    setRenderedToast(null);
    hideCurrent();
  }, [hideCurrent]);

  const startExit = useCallback(() => {
    if (!renderedToast) {
      return;
    }
    clearCloseTimer();
    cancelAnimation(translateY);
    cancelAnimation(opacity);
    const direction = renderedToast.position === "bottom" ? 1 : -1;
    opacity.value = withTiming(0, { duration: EXIT_OPACITY_MS });
    translateY.value = withSpring(
      direction * EXIT_Y_OFFSET,
      springs.fabActions,
      () => {
        runOnJS(finalizeDismiss)();
      },
    );
  }, [clearCloseTimer, finalizeDismiss, opacity, renderedToast, translateY]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    clearCloseTimer();
    setRenderedToast(toast);
    const direction = toast.position === "bottom" ? 1 : -1;
    cancelAnimation(translateY);
    cancelAnimation(opacity);
    translateY.value = direction * EXIT_Y_OFFSET;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: ENTER_OPACITY_MS });
    translateY.value = withSpring(0, springs.fabActions);
    closeTimerRef.current = setTimeout(startExit, toast.durationMs);
  }, [clearCloseTimer, opacity, startExit, toast, translateY]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!renderedToast) {
    return null;
  }

  const conf = variantConfig(renderedToast.variant, colors);
  const Icon = conf.icon;
  const top = insets.top + spacing.xl + spacing.md;
  const bottom =
    spacing.tabBarHeight +
    Math.max(insets.bottom, spacing.sm) +
    spacing.xl +
    spacing.md;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        pointerEvents="box-none"
        style={[
          styles.anchor,
          renderedToast.position === "top" ? { top } : { bottom },
        ]}
      >
        <Animated.View style={[styles.card, animatedStyle, styles.cardNeutral]}>
          <View style={styles.leading}>
            <Icon size={18} color={conf.accent} strokeWidth={2.2} />
          </View>
          <Text style={styles.message} numberOfLines={2}>
            {renderedToast.message}
          </Text>
          {renderedToast.action ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                renderedToast.action?.onPress?.();
                startExit();
              }}
              style={({ pressed }) => [
                styles.action,
                pressed && styles.actionPressed,
              ]}
            >
              <Text style={[styles.actionText, { color: conf.accent }]}>
                {renderedToast.action.label}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            hitSlop={12}
            onPress={startExit}
            style={({ pressed }) => [
              styles.close,
              pressed && styles.actionPressed,
            ]}
          >
            <X size={16} color={colors.inkSoft} strokeWidth={2.2} />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  anchor: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 120,
  },
  card: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    ...shadows.toast,
    gap: spacing.sm,
  },
  cardNeutral: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
  },
  leading: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  action: {
    minHeight: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPressed: {
    opacity: 0.72,
  },
  actionText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
}));
