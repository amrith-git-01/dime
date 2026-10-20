import { memo } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { createThemedStyles } from "@/theme";

import {
  getSegmentFill,
  REEL_SCENE_MS,
  type SegmentFill,
} from "./reelLogic";

const SEGMENT_HEIGHT = 4;
/** Touch target of one segment (the visible bar is only SEGMENT_HEIGHT tall). */
const SEGMENT_HIT_HEIGHT = 16;

/** The active segment's fill: the only part that subscribes to the clock (scaleX, left origin). */
function LiveFill({ clock }: { clock: SharedValue<number> }) {
  const styles = useStyles();
  const style = useAnimatedStyle(() => ({
    transform: [
      { scaleX: Math.min(1, Math.max(0, clock.value / REEL_SCENE_MS)) },
    ],
  }));
  return <Animated.View style={[styles.fill, styles.fillFull, style]} />;
}

const ReelSegment = memo(function ReelSegment({
  fill,
  clock,
  onPress,
}: {
  fill: SegmentFill;
  clock: SharedValue<number>;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable style={styles.hit} onPress={onPress} hitSlop={{ top: 8, bottom: 8 }}>
      <View style={styles.track}>
        {fill === "live" ? (
          <LiveFill clock={clock} />
        ) : fill === "full" ? (
          <View style={[styles.fill, styles.fillFull]} />
        ) : null}
      </View>
    </Pressable>
  );
});

export type ReelProgressProps = {
  count: number;
  activeIndex: number;
  reduceMotion: boolean;
  clock: SharedValue<number>;
  onSelect: (index: number) => void;
};

/**
 * One segment per scene (the tour's segmented bar): past scenes full, the active one filling
 * with the scene clock, upcoming ones empty. Tapping a segment jumps to that scene. Hidden from
 * screen readers, which move between scenes with the reel's increment / decrement actions.
 */
export const ReelProgress = memo(function ReelProgress({
  count,
  activeIndex,
  reduceMotion,
  clock,
  onSelect,
}: ReelProgressProps) {
  const styles = useStyles();
  return (
    <View
      style={styles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }, (_, i) => (
        <ReelSegment
          key={i}
          fill={getSegmentFill(i, activeIndex, reduceMotion)}
          clock={clock}
          onPress={() => onSelect(i)}
        />
      ))}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
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
    backgroundColor: colors.accentTint,
  },
  fill: {
    height: SEGMENT_HEIGHT,
    borderRadius: SEGMENT_HEIGHT / 2,
    backgroundColor: colors.accentText,
  },
  fillFull: {
    width: "100%",
    transformOrigin: "left center",
  },
}));
