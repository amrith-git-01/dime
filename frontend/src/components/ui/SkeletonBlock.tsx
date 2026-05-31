import { useEffect } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { skeletonPulse } from "@/constants/motion";
import { radius, skeleton } from "@/constants";

type SkeletonTone = "surface" | "onPrimary";

type SkeletonBlockProps = {
  style?: StyleProp<ViewStyle>;
  tone?: SkeletonTone;
};

const toneStyles: Record<SkeletonTone, ViewStyle> = {
  surface: {
    backgroundColor: skeleton.surface,
  },
  onPrimary: {
    backgroundColor: skeleton.onPrimary,
  },
};

export function SkeletonBlock({ style, tone = "surface" }: SkeletonBlockProps) {
  const pulse = useSharedValue<number>(skeletonPulse.opacityMin);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(skeletonPulse.opacityMax, {
          duration: skeletonPulse.durationMs,
        }),
        withTiming(skeletonPulse.opacityMin, {
          duration: skeletonPulse.durationMs,
        }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <Animated.View style={[styles.base, toneStyles[tone], animStyle, style]} />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.sm,
  },
});
