import { memo, useEffect, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { withAlpha } from "@/constants";
import { springs } from "@/constants/motion";
import { createThemedStyles, useTheme } from "@/theme";

import type { TourMotion } from "../utils/tourMotion";

import { TourShimmer } from "./TourShimmer";

const SEGMENT_HEIGHT = 4;
const SPARKLE_SIZE = 18;
const SPARKLE_CENTER = SPARKLE_SIZE / 2;
const SPARKLE_MS = 520;

/** Four-point sparkle with concave sides, centered in the little box. */
const SPARKLE_PATH = (() => {
  const c = SPARKLE_CENTER;
  const radius = 7;
  const pinch = radius * 0.2;
  return [
    `M${c} ${c - radius}`,
    `Q${c + pinch} ${c - pinch} ${c + radius} ${c}`,
    `Q${c + pinch} ${c + pinch} ${c} ${c + radius}`,
    `Q${c - pinch} ${c + pinch} ${c - radius} ${c}`,
    `Q${c - pinch} ${c - pinch} ${c} ${c - radius}`,
    "Z",
  ].join(" ");
})();

/**
 * A star that pops at the end of a segment when it fills, then fades. SVG and Reanimated, not a
 * Skia canvas: a bar has a handful of segments and each would otherwise need its own GL surface.
 */
const SegmentSparkle = memo(function SegmentSparkle({
  playKey,
}: {
  playKey: number;
}) {
  const { colors } = useTheme();
  const progress = useSharedValue(1);

  useEffect(() => {
    if (playKey === 0) {
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: SPARKLE_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [playKey, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value >= 1 ? 0 : 1 - progress.value * 0.7,
    transform: [
      { scale: 0.3 + Math.sin(progress.value * Math.PI) * 0.9 },
      { rotate: `${progress.value * 0.8}rad` },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          right: -SPARKLE_CENTER,
          top: -(SPARKLE_CENTER - SEGMENT_HEIGHT / 2),
          width: SPARKLE_SIZE,
          height: SPARKLE_SIZE,
        },
        animatedStyle,
      ]}
    >
      <Svg width={SPARKLE_SIZE} height={SPARKLE_SIZE}>
        <Path d={SPARKLE_PATH} fill={colors.accentText} />
      </Svg>
    </Animated.View>
  );
});

const TourProgressSegment = memo(function TourProgressSegment({
  filled,
  motion,
}: {
  filled: boolean;
  motion: TourMotion;
}) {
  const styles = useStyles();
  const fill = useSharedValue(filled ? 1 : 0);
  const pop = useSharedValue(1);
  const wasFilledRef = useRef(filled);
  const [sparkleKey, setSparkleKey] = useState(0);

  useEffect(() => {
    const target = filled ? 1 : 0;
    fill.value = motion.spring
      ? withSpring(target, springs.progress)
      : withTiming(target, { duration: motion.fadeMs });
    // A segment that fills in front of the user pops and sparkles (not the ones already filled).
    if (filled && !wasFilledRef.current && motion.spring) {
      pop.value = withSequence(
        withTiming(1.9, { duration: 120 }),
        withSpring(1, springs.snappy),
      );
      setSparkleKey((key) => key + 1);
    }
    wasFilledRef.current = filled;
  }, [filled, motion.spring, motion.fadeMs, fill, pop]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
  }));
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: pop.value }],
  }));

  return (
    <View style={styles.segmentSlot}>
      <Animated.View style={[styles.segment, popStyle]}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </Animated.View>
      <SegmentSparkle playKey={sparkleKey} />
    </View>
  );
});

export type TourProgressBarProps = {
  /** Number of segments (the tour's numbered steps, or the number of tours). */
  count: number;
  /** 1-based position; every segment up to it is filled. */
  current: number;
  motion: TourMotion;
};

/**
 * One segment per step; reaching a step fills its segment with a spring and a small sparkle at its
 * end, and passing the halfway point sends a soft shimmer along the whole bar.
 */
export const TourProgressBar = memo(function TourProgressBar({
  count,
  current,
  motion,
}: TourProgressBarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [size, setSize] = useState({ width: 0, height: SEGMENT_HEIGHT });
  const [shimmerKey, setShimmerKey] = useState(0);
  const previousRef = useRef(current);
  const halfway = Math.ceil(count / 2);

  useEffect(() => {
    if (
      motion.spring &&
      count >= 4 &&
      previousRef.current < current &&
      current === halfway
    ) {
      setShimmerKey((key) => key + 1);
    }
    previousRef.current = current;
  }, [current, halfway, count, motion.spring]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={styles.row} accessibilityElementsHidden onLayout={onLayout}>
      {Array.from({ length: count }, (_, i) => (
        <TourProgressSegment key={i} filled={i < current} motion={motion} />
      ))}
      {size.width > 0 ? (
        <TourShimmer
          width={size.width}
          height={size.height}
          cornerRadius={SEGMENT_HEIGHT / 2}
          color={withAlpha(colors.onAccent, 0.75)}
          playKey={shimmerKey}
          delayMs={140}
          durationMs={760}
        />
      ) : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    gap: 4,
  },
  segmentSlot: {
    flex: 1,
    height: SEGMENT_HEIGHT,
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
