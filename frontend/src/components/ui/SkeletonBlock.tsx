import { useEffect } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { skeletonPulse } from "@/constants/motion";
import { radius } from "@/constants";
import { createThemedStyles } from "@/theme";

type SkeletonTone = "surface" | "onPrimary";

type SkeletonBlockProps = {
  style?: StyleProp<ViewStyle>;
  tone?: SkeletonTone;
};

export function SkeletonBlock({ style, tone = "surface" }: SkeletonBlockProps) {
  const styles = useStyles();
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
    <Animated.View style={[styles.base, styles[tone], animStyle, style]} />
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  base: {
    borderRadius: radius.sm,
  },
  surface: {
    backgroundColor: colors.skeleton.surface,
  },
  onPrimary: {
    backgroundColor: colors.skeleton.onSurface,
  },
}));
