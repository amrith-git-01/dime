import React, { useLayoutEffect, useRef } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface AnimatedProgressBarProps {
  progress: number; // 0-1
  backgroundColor?: string;
  fillColor?: string;
  height?: number;
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
 *
 * Reanimated rule: `useAnimatedStyle` runs on UI thread — only inline math or functions
 * marked with `"worklet"`. Do not call normal JS helpers inside the style callback.
 */
export const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({
  progress,
  backgroundColor = "#F2F0FF",
  fillColor = "#FF6B6B",
  height = 8,
  duration = 1000,
  animated = true,
  animateOnceKey,
}) => {
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

    animatedProgress.value = withTiming(next, {
      duration,
      easing: Easing.inOut(Easing.ease),
    });
  }, [progress, animated, animateOnceKey, animatedProgress, duration]);

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
      style={[styles.track, { backgroundColor, height }]}
      onLayout={onTrackLayout}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            height,
            backgroundColor: fillColor,
            borderRadius: height / 2,
          },
          fillStyle,
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    borderRadius: 999,
    overflow: "hidden",
    width: "100%",
  },
  fill: {
    width: "100%",
  },
});
