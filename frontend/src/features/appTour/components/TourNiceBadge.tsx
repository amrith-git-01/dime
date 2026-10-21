import { Check } from "lucide-react-native";
import { memo, useEffect } from "react";
import { Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { springs } from "@/constants/motion";
import { createThemedStyles, useTheme } from "@/theme";

import type { TourMotion } from "../utils/tourMotion";

export type TourNiceBadgeProps = {
  /** Where it sits (the middle of the target that was just used), in overlay coordinates. */
  x: number;
  y: number;
  motion: TourMotion;
};

/**
 * "Nice!" with a check: pops in over the target the user just used, holds for a moment while the
 * tour gets the next step ready, then fades. Under reduced motion it only fades.
 */
export const TourNiceBadge = memo(function TourNiceBadge({
  x,
  y,
  motion,
}: TourNiceBadgeProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const shown = useSharedValue(0);

  useEffect(() => {
    const hold = Math.max(0, motion.niceHoldMs - 220);
    shown.value = motion.spring
      ? withSequence(
          withSpring(1, springs.bouncy),
          withDelay(hold, withTiming(0, { duration: 200 })),
        )
      : withSequence(
          withTiming(1, { duration: motion.fadeMs }),
          withDelay(hold, withTiming(0, { duration: motion.fadeMs })),
        );
  }, [motion.spring, motion.niceHoldMs, motion.fadeMs, shown]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 1.4),
    transform: [
      { translateY: (1 - shown.value) * 10 },
      { scale: motion.spring ? 0.7 + shown.value * 0.3 : 1 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.pill, { left: x, top: y }, animatedStyle]}
    >
      <Check size={16} color={colors.onSuccess} strokeWidth={3} />
      <Text style={styles.label}>Nice!</Text>
    </Animated.View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  // Centered on (x, y) by the negative margins (the pill is about 84 x 36).
  pill: {
    position: "absolute",
    marginLeft: -42,
    marginTop: -18,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    ...shadows.fab,
  },
  label: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.onSuccess,
  },
}));
