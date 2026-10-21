import { Sparkles } from "lucide-react-native";

import { memo, useEffect, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { radius, spacing, withAlpha } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { springs } from "@/constants/motion";
import { createThemedStyles, useTheme } from "@/theme";

import type { TourIconComponent } from "./tourIcon";
import type { TourMotion } from "../utils/tourMotion";

import { TourShimmer } from "./TourShimmer";

export type TourSamplePillProps = {
  label: string;
  /** Replaces the sparkle (the scripted Ask AI chat shows the Dime mark). */
  icon?: TourIconComponent;
  /** Distance from the top of the overlay (below the status bar). */
  top: number;
  motion: TourMotion;
};

/** "Sample data": says the numbers on screen are an example, with a soft shimmer as it appears. */
export const TourSamplePill = memo(function TourSamplePill({
  label,
  icon: Icon = Sparkles,
  top,
  motion,
}: TourSamplePillProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const enter = useSharedValue(0);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    enter.value = motion.spring
      ? withSpring(1, springs.tourCard)
      : withTiming(1, { duration: motion.fadeMs });
  }, [motion.spring, motion.fadeMs, enter]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.5),
    transform: [{ translateY: (1 - enter.value) * -8 }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={[styles.wrap, { top }]} pointerEvents="none">
      <Animated.View
        accessible
        accessibilityLabel={label}
        style={[styles.pill, animatedStyle]}
        onLayout={onLayout}
      >
        <Icon size={13} color={colors.accentText} strokeWidth={2.2} />
        <Text style={styles.label}>{label}</Text>
        {motion.ripple && size.width > 0 ? (
          <TourShimmer
            width={size.width}
            height={size.height}
            cornerRadius={radius.full}
            color={withAlpha(colors.surface, 0.9)}
            playKey={1}
            delayMs={260}
            durationMs={800}
          />
        ) : null}
      </Animated.View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...shadows.card,
  },
  label: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    color: colors.accentText,
  },
}));
