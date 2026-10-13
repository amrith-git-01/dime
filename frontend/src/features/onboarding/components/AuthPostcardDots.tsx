import { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { radius, spacing, springs } from "@/constants";
import { useTheme } from "@/theme";

const INACTIVE_DOT_WIDTH = 8;
const ACTIVE_DOT_WIDTH = 20;
const DOT_HEIGHT = 8;

export interface AuthPostcardDotsProps {
  count: number;
  activeIndex: number;
}

type AnimatedDotProps = {
  index: number;
  activeIndex: number;
};

const AnimatedDot = memo(function AnimatedDot({
  index,
  activeIndex,
}: AnimatedDotProps) {
  const { colors } = useTheme();
  const isActive = index === activeIndex;
  const progress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isActive ? 1 : 0, springs.smooth);
  }, [isActive, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: interpolate(
      progress.value,
      [0, 1],
      [INACTIVE_DOT_WIDTH, ACTIVE_DOT_WIDTH],
    ),
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.accentTint, colors.accentText],
    ),
  }));

  return (
    <Animated.View
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      style={[styles.dot, animatedStyle]}
    />
  );
});

export const AuthPostcardDots = memo(function AuthPostcardDots({
  count,
  activeIndex,
}: AuthPostcardDotsProps) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {Array.from({ length: count }, (_, index) => (
        <AnimatedDot key={index} index={index} activeIndex={activeIndex} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
  dot: {
    height: DOT_HEIGHT,
    borderRadius: radius.full,
  },
});
