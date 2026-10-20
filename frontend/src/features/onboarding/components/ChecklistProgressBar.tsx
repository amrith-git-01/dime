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

const SEGMENT_HEIGHT = 4;
const REDUCED_FADE_MS = 180;

const Segment = memo(function Segment({
  filled,
  reduceMotion,
}: {
  filled: boolean;
  reduceMotion: boolean;
}) {
  const styles = useStyles();
  const fill = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    const target = filled ? 1 : 0;
    fill.value = reduceMotion
      ? withTiming(target, { duration: REDUCED_FADE_MS })
      : withSpring(target, springs.progress);
  }, [filled, reduceMotion, fill]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
  }));

  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  );
});

export type ChecklistProgressBarProps = {
  total: number;
  done: number;
  reduceMotion: boolean;
};

/** One thin segment per item, filled with a spring as items get done (hidden from screen readers: the count is spoken elsewhere). */
export const ChecklistProgressBar = memo(function ChecklistProgressBar({
  total,
  done,
  reduceMotion,
}: ChecklistProgressBarProps) {
  const styles = useStyles();
  return (
    <View
      style={styles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: total }, (_, i) => (
        <Segment key={i} filled={i < done} reduceMotion={reduceMotion} />
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
