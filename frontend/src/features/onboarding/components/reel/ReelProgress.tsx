import { memo } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { withAlpha } from "@/constants/colorUtils";
import { createThemedStyles } from "@/theme";

import {
  getSegmentFill,
  REEL_SCENE_MS,
  type SegmentFill,
} from "./reelLogic";
import { type ReelPhase } from "./reelMachine";

const SEGMENT_HEIGHT = 4;
/** Thinner bar for the panel-mounted reel; the touch target stays SEGMENT_HIT_HEIGHT. */
const SEGMENT_HEIGHT_FRAMELESS = 3;
/** Touch target of one segment (the visible bar is only SEGMENT_HEIGHT tall). */
const SEGMENT_HIT_HEIGHT = 16;

/**
 * The active segment's fill: the only part that subscribes to the clock (scaleX, left origin).
 * The clock is reset after the commit that changes the scene, so until `sceneGen` reaches this
 * scene's generation the clock still holds the previous scene's time and the fill stays empty.
 */
function LiveFill({
  clock,
  sceneGen,
  activeGen,
}: {
  clock: SharedValue<number>;
  sceneGen: SharedValue<number>;
  activeGen: number;
}) {
  const styles = useStyles();
  const style = useAnimatedStyle(() => {
    const ready = sceneGen.value === activeGen;
    return {
      transform: [
        {
          scaleX: ready
            ? Math.min(1, Math.max(0, clock.value / REEL_SCENE_MS))
            : 0,
        },
      ],
    };
  });
  return <Animated.View style={[styles.fill, styles.fillFull, style]} />;
}

const ReelSegment = memo(function ReelSegment({
  index,
  fill,
  clock,
  sceneGen,
  activeGen,
  frameless,
  onSelect,
}: {
  index: number;
  fill: SegmentFill;
  clock: SharedValue<number>;
  sceneGen: SharedValue<number>;
  activeGen: number;
  frameless: boolean;
  onSelect: (index: number) => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      style={styles.hit}
      onPress={() => onSelect(index)}
      hitSlop={{ top: 8, bottom: 8 }}
    >
      <View style={frameless ? styles.trackFrameless : styles.track}>
        {fill === "live" ? (
          <LiveFill clock={clock} sceneGen={sceneGen} activeGen={activeGen} />
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
  /** While "exiting" the active segment is drawn complete (the clock is stopped). */
  phase: ReelPhase;
  clock: SharedValue<number>;
  /** Generation the clock currently belongs to, and the one the active scene is waiting for. */
  sceneGen: SharedValue<number>;
  activeGen: number;
  /** Thinner bars with an accent-alpha track, for the reel on the Welcome panel. */
  frameless?: boolean;
  /** Stable: called with the tapped segment's index. */
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
  phase,
  clock,
  sceneGen,
  activeGen,
  frameless = false,
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
          index={i}
          fill={getSegmentFill(i, activeIndex, reduceMotion, phase)}
          clock={clock}
          sceneGen={sceneGen}
          activeGen={activeGen}
          frameless={frameless}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, scheme }) => ({
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
  trackFrameless: {
    height: SEGMENT_HEIGHT_FRAMELESS,
    borderRadius: SEGMENT_HEIGHT_FRAMELESS / 2,
    overflow: "hidden",
    backgroundColor:
      scheme === "dark"
        ? withAlpha(colors.accentText, 0.3)
        : withAlpha(colors.accent, 0.22),
  },
  // Fills the track whatever its height; the track clips the rounded ends.
  fill: {
    height: "100%",
    borderRadius: SEGMENT_HEIGHT / 2,
    backgroundColor: colors.accentText,
  },
  fillFull: {
    width: "100%",
    transformOrigin: "left center",
  },
}));
