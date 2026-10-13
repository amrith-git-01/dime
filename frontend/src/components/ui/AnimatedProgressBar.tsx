import React, { useLayoutEffect, useRef } from "react";
import { LayoutChangeEvent, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { springs } from "@/constants/motion";
import { radius } from "@/constants";
import { createThemedStyles } from "@/theme";

interface AnimatedProgressBarProps {
  progress: number; // 0-1
  backgroundColor?: string;
  fillColor?: string;
  height?: number;
  /** Kept for API compat; fill uses spring physics when `animated` is true. */
  duration?: number;
  /** When false, snaps to `progress` with no timing. */
  animated?: boolean;
  /**
   * Animate fill once per key (e.g. `hero-May-2026`, `budget-{categoryId}-May-2026`).
   * Re-mounts with same key snap to value — stops FlashList recycle re-animating.
   */
  animateOnceKey?: string;
}

/** Keys that already played their entrance animation this session. */
const completedAnimateOnceKeys = new Set<string>();

/** JS-thread only — never call from `useAnimatedStyle` (UI worklet). */
function clampProgressJs(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function initialAnimatedProgress(
  progress: number,
  animateOnceKey?: string,
): number {
  if (animateOnceKey && completedAnimateOnceKeys.has(animateOnceKey)) {
    return clampProgressJs(progress);
  }
  return 0;
}

/**
 * GPU-friendly fill: scaleX from the left (translateX anchor) instead of animating width.
 */
export const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({
  progress,
  backgroundColor,
  fillColor,
  height = 8,
  animated = true,
  animateOnceKey,
}) => {
  const styles = useStyles();
  const animatedProgress = useSharedValue(
    initialAnimatedProgress(progress, animateOnceKey),
  );
  const trackWidth = useSharedValue(0);
  const lastAppliedProgressRef = useRef<number | null>(
    initialAnimatedProgress(progress, animateOnceKey),
  );

  useLayoutEffect(() => {
    const next = clampProgressJs(progress);

    if (animateOnceKey && completedAnimateOnceKeys.has(animateOnceKey)) {
      animatedProgress.value = next;
      lastAppliedProgressRef.current = next;
      return;
    }

    if (
      lastAppliedProgressRef.current !== null &&
      Math.abs(lastAppliedProgressRef.current - next) < 0.001
    ) {
      return;
    }
    lastAppliedProgressRef.current = next;

    if (!animated) {
      animatedProgress.value = next;
      return;
    }

    if (next < 0.001) {
      animatedProgress.value = 0;
      return;
    }

    if (animateOnceKey) {
      completedAnimateOnceKeys.add(animateOnceKey);
    }

    animatedProgress.value = withSpring(next, springs.progress);
  }, [progress, animated, animateOnceKey, animatedProgress]);

  const onTrackLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) {
      trackWidth.value = width;
    }
  };

  const fillStyle = useAnimatedStyle(() => {
    "worklet";
    const value = animatedProgress.value;
    const clamped = Math.max(0, Math.min(1, value));
    const width = trackWidth.value;
    if (width <= 0) {
      return {
        transform: [{ scaleX: clamped }],
      };
    }
    return {
      transform: [
        { translateX: (-width * (1 - clamped)) / 2 },
        { scaleX: clamped },
      ],
    };
  });

  return (
    <View
      style={[
        styles.track,
        backgroundColor != null && { backgroundColor },
        { height },
      ]}
      onLayout={onTrackLayout}
    >
      <Animated.View
        style={[
          styles.fill,
          fillColor != null && { backgroundColor: fillColor },
          {
            height,
            borderRadius: height / 2,
          },
          fillStyle,
        ]}
      />
    </View>
  );
};

const useStyles = createThemedStyles(({ colors }) => ({
  track: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.full,
    overflow: "hidden",
    width: "100%",
  },
  fill: {
    width: "100%",
    backgroundColor: colors.accent,
  },
}));
