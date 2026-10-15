import { memo, useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { springs } from "@/constants/motion";
import { createThemedStyles } from "@/theme";

import type { TourMotion } from "../utils/tourMotion";

const DOT_SIZE = 6;
const ACTIVE_WIDTH = 20;

type TourProgressDotProps = {
  active: boolean;
  done: boolean;
  motion: TourMotion;
};

const TourProgressDot = memo(function TourProgressDot({
  active,
  done,
  motion,
}: TourProgressDotProps) {
  const styles = useStyles();
  const width = useSharedValue(active ? ACTIVE_WIDTH : DOT_SIZE);
  const fill = useSharedValue(active || done ? 1 : 0);

  useEffect(() => {
    const nextWidth = active ? ACTIVE_WIDTH : DOT_SIZE;
    const nextFill = active || done ? 1 : 0;
    if (motion.spring) {
      width.value = withSpring(nextWidth, springs.snappy);
    } else {
      width.value = nextWidth;
    }
    fill.value = withTiming(nextFill, { duration: motion.fadeMs });
  }, [active, done, motion.spring, motion.fadeMs, width, fill]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: width.value,
    opacity: 0.3 + fill.value * 0.7,
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
});

export type TourProgressDotsProps = {
  count: number;
  index: number;
  motion: TourMotion;
};

/** One dot per step; the current one stretches into a pill, finished ones stay lit. */
export const TourProgressDots = memo(function TourProgressDots({
  count,
  index,
  motion,
}: TourProgressDotsProps) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessibilityElementsHidden>
      {Array.from({ length: count }, (_, i) => (
        <TourProgressDot
          key={i}
          active={i === index}
          done={i < index}
          motion={motion}
        />
      ))}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.accentText,
  },
}));
