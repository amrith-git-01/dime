import { memo, useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { springs } from "@/constants/motion";
import { useTheme } from "@/theme";

import type { TourMotion } from "../utils/tourMotion";

const SIZE = 72;
const CENTER = SIZE / 2;
const RADIUS = 30;
/** Length of the check's two strokes (a little over, so the dash always covers it). */
const CHECK_LENGTH = 40;

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type TourCheckMarkProps = {
  /** Starts the draw-in (the finish card became visible). */
  play: boolean;
  motion: TourMotion;
};

/**
 * The finish card's mark: a badge pops in and its check is drawn stroke by stroke. Drawn with SVG
 * and Reanimated (a Skia canvas here would be one more GL surface to create on the UI thread).
 */
export const TourCheckMark = memo(function TourCheckMark({
  play,
  motion,
}: TourCheckMarkProps) {
  const { colors } = useTheme();
  const badge = useSharedValue(motion.spring ? 0 : 1);
  const draw = useSharedValue(motion.spring ? 0 : 1);

  useEffect(() => {
    if (!motion.spring) {
      badge.value = 1;
      draw.value = 1;
      return;
    }
    if (!play) {
      return;
    }
    badge.value = withSpring(1, springs.bouncy);
    draw.value = withDelay(
      160,
      withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }),
    );
  }, [play, motion.spring, badge, draw]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, badge.value * 1.5),
    transform: [{ scale: 0.6 + badge.value * 0.4 }],
  }));
  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LENGTH * (1 - draw.value),
  }));

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Animated.View style={[{ position: "absolute", width: SIZE, height: SIZE }, badgeStyle]}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={CENTER} cy={CENTER} r={RADIUS + 5} fill={colors.accentTint} />
          <Circle cx={CENTER} cy={CENTER} r={RADIUS} fill={colors.accent} />
        </Svg>
      </Animated.View>
      <Svg width={SIZE} height={SIZE} style={{ position: "absolute" }}>
        <AnimatedPath
          d={`M${CENTER - 11} ${CENTER + 1} L${CENTER - 3} ${CENTER + 10} L${CENTER + 12} ${CENTER - 9}`}
          stroke={colors.onAccent}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={CHECK_LENGTH}
          animatedProps={checkProps}
        />
      </Svg>
    </View>
  );
});
