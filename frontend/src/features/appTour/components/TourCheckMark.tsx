import { Canvas, Circle, Group, Path, Skia } from "@shopify/react-native-skia";
import { memo, useEffect, useMemo } from "react";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { springs } from "@/constants/motion";
import { useTheme } from "@/theme";

import type { TourMotion } from "../utils/tourMotion";

const SIZE = 72;
const CENTER = SIZE / 2;
const RADIUS = 30;

export type TourCheckMarkProps = {
  /** Starts the draw-in (the finish card became visible). */
  play: boolean;
  motion: TourMotion;
};

/** The finish card's mark: a badge pops in and its check is drawn stroke by stroke. */
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

  const check = useMemo(() => {
    const path = Skia.Path.Make();
    path.moveTo(CENTER - 11, CENTER + 1);
    path.lineTo(CENTER - 3, CENTER + 10);
    path.lineTo(CENTER + 12, CENTER - 9);
    return path;
  }, []);

  const badgeTransform = useDerivedValue(() => [
    { scale: 0.6 + badge.value * 0.4 },
  ]);
  const badgeOpacity = useDerivedValue(() => Math.min(1, badge.value * 1.5));

  return (
    <Canvas style={{ width: SIZE, height: SIZE }}>
      <Group
        transform={badgeTransform}
        origin={{ x: CENTER, y: CENTER }}
        opacity={badgeOpacity}
      >
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS + 5}
          color={colors.accentTint}
        />
        <Circle cx={CENTER} cy={CENTER} r={RADIUS} color={colors.accent} />
      </Group>
      <Path
        path={check}
        style="stroke"
        strokeWidth={5}
        strokeCap="round"
        strokeJoin="round"
        color={colors.onAccent}
        start={0}
        end={draw}
      />
    </Canvas>
  );
});
