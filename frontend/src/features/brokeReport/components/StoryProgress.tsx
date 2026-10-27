import { memo } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { withAlpha } from "@/constants/colorUtils";
import type { ReportTone } from "@/constants/reportPalette";
import { createThemedStyles } from "@/theme";

import { getSegmentFill, type SegmentFill } from "../utils/storyLogic";

const SEGMENT_HEIGHT = 4;
/** Touch target of one segment (the visible bar is only SEGMENT_HEIGHT tall). */
const SEGMENT_HIT_HEIGHT = 20;

/**
 * The active segment's fill: the only part that subscribes to the clock (scaleX, left origin). Until
 * `slideGen` reaches this slide's generation the clock still holds the previous slide's time, and
 * the fill stays empty.
 */
function LiveFill({
  clock,
  duration,
  slideGen,
  activeGen,
  color,
}: {
  clock: SharedValue<number>;
  duration: SharedValue<number>;
  slideGen: SharedValue<number>;
  activeGen: number;
  color: string;
}) {
  const styles = useStyles();
  const style = useAnimatedStyle(() => {
    const ready = slideGen.value === activeGen && duration.value > 0;
    return {
      transform: [
        {
          scaleX: ready
            ? Math.min(1, Math.max(0, clock.value / duration.value))
            : 0,
        },
      ],
    };
  });
  return <Animated.View style={[styles.fill, { backgroundColor: color }, style]} />;
}

const Segment = memo(function Segment({
  index,
  fill,
  clock,
  duration,
  slideGen,
  activeGen,
  tone,
  onSelect,
}: {
  index: number;
  fill: SegmentFill;
  clock: SharedValue<number>;
  duration: SharedValue<number>;
  slideGen: SharedValue<number>;
  activeGen: number;
  tone: ReportTone;
  onSelect: (index: number) => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      style={styles.hit}
      onPress={() => onSelect(index)}
      hitSlop={{ top: 8, bottom: 8 }}
    >
      <View style={[styles.track, { backgroundColor: withAlpha(tone.text, 0.24) }]}>
        {fill === "live" ? (
          <LiveFill
            clock={clock}
            duration={duration}
            slideGen={slideGen}
            activeGen={activeGen}
            color={tone.text}
          />
        ) : fill === "full" ? (
          <View style={[styles.fill, { backgroundColor: tone.text }]} />
        ) : null}
      </View>
    </Pressable>
  );
});

export type StoryProgressProps = {
  count: number;
  activeIndex: number;
  staticFrames: boolean;
  clock: SharedValue<number>;
  duration: SharedValue<number>;
  slideGen: SharedValue<number>;
  activeGen: number;
  tone: ReportTone;
  /** Stable: called with the tapped segment's index. */
  onSelect: (index: number) => void;
};

/**
 * One segment per slide: past slides full, the active one filling with the slide clock, upcoming
 * ones empty. Tapping a segment jumps to that slide. Hidden from screen readers, which move
 * between slides with the player's Previous and Next buttons.
 */
export const StoryProgress = memo(function StoryProgress({
  count,
  activeIndex,
  staticFrames,
  clock,
  duration,
  slideGen,
  activeGen,
  tone,
  onSelect,
}: StoryProgressProps) {
  const styles = useStyles();
  return (
    <View
      style={styles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }, (_, i) => (
        <Segment
          key={i}
          index={i}
          fill={getSegmentFill(i, activeIndex, staticFrames)}
          clock={clock}
          duration={duration}
          slideGen={slideGen}
          activeGen={activeGen}
          tone={tone}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
});

const useStyles = createThemedStyles(() => ({
  row: {
    flex: 1,
    flexDirection: "row",
    gap: 4,
  },
  hit: {
    flex: 1,
    height: SEGMENT_HIT_HEIGHT,
    justifyContent: "center",
  },
  track: {
    height: SEGMENT_HEIGHT,
    borderRadius: SEGMENT_HEIGHT / 2,
    overflow: "hidden",
  },
  // Fills the track whatever its height; the track clips the rounded ends.
  fill: {
    width: "100%",
    height: "100%",
    borderRadius: SEGMENT_HEIGHT / 2,
    transformOrigin: "left center",
  },
}));
