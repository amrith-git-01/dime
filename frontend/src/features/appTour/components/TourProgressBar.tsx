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

const SEGMENT_HEIGHT = 4;

const TourProgressSegment = memo(function TourProgressSegment({
  filled,
  motion,
}: {
  filled: boolean;
  motion: TourMotion;
}) {
  const styles = useStyles();
  const fill = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    const target = filled ? 1 : 0;
    fill.value = motion.spring
      ? withSpring(target, springs.progress)
      : withTiming(target, { duration: motion.fadeMs });
  }, [filled, motion.spring, motion.fadeMs, fill]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
  }));

  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  );
});

export type TourProgressBarProps = {
  /** Number of action steps. */
  count: number;
  /** 1-based action step the tour is on; every segment up to it is filled. */
  current: number;
  motion: TourMotion;
};

/** One segment per action step; reaching a step fills its segment with a spring. */
export const TourProgressBar = memo(function TourProgressBar({
  count,
  current,
  motion,
}: TourProgressBarProps) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessibilityElementsHidden>
      {Array.from({ length: count }, (_, i) => (
        <TourProgressSegment key={i} filled={i < current} motion={motion} />
      ))}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    gap: 4,
  },
  segment: {
    flex: 1,
    height: SEGMENT_HEIGHT,
    borderRadius: SEGMENT_HEIGHT / 2,
    overflow: "hidden",
    backgroundColor: colors.accentTint,
  },
  fill: {
    height: SEGMENT_HEIGHT,
    borderRadius: SEGMENT_HEIGHT / 2,
    backgroundColor: colors.accentText,
  },
}));
