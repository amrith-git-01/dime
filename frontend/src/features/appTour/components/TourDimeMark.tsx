import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  Skia,
  vec,
} from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

import type { TourMotion } from "../utils/tourMotion";

const SIZE = 96;
const CENTER = SIZE / 2;
const COIN_RADIUS = 30;

/** Four-point sparkle with concave sides, centered on (cx, cy). */
function buildSparklePath(cx: number, cy: number, radius: number) {
  const path = Skia.Path.Make();
  const pinch = radius * 0.16;
  path.moveTo(cx, cy - radius);
  path.quadTo(cx + pinch, cy - pinch, cx + radius, cy);
  path.quadTo(cx + pinch, cy + pinch, cx, cy + radius);
  path.quadTo(cx - pinch, cy + pinch, cx - radius, cy);
  path.quadTo(cx - pinch, cy - pinch, cx, cy - radius);
  path.close();
  return path;
}

export type TourDimeMarkProps = {
  motion: TourMotion;
};

/** The welcome card's hero: a small Dime coin with a sparkle that floats, with twinkling stars. */
export function TourDimeMark({ motion }: TourDimeMarkProps) {
  const { colors } = useTheme();
  const phase = useSharedValue(0);

  useEffect(() => {
    if (!motion.sparkle) {
      phase.value = 0;
      return;
    }
    phase.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [motion.sparkle, phase]);

  const mainSparkle = useMemo(
    () => buildSparklePath(CENTER, CENTER, 17),
    [],
  );
  const twinkleLarge = useMemo(() => buildSparklePath(0, 0, 9), []);
  const twinkleSmall = useMemo(() => buildSparklePath(0, 0, 6), []);

  const coinTransform = useDerivedValue(() => [
    { translateY: -3 + phase.value * 6 },
  ]);
  const sparkleTransform = useDerivedValue(() => [
    { rotate: (phase.value - 0.5) * 0.5 },
    { scale: 0.92 + phase.value * 0.16 },
  ]);
  const twinkleATransform = useDerivedValue(() => [
    { translateX: 17 },
    { translateY: 20 },
    { scale: 0.5 + phase.value * 0.7 },
  ]);
  const twinkleBTransform = useDerivedValue(() => [
    { translateX: SIZE - 15 },
    { translateY: SIZE - 24 },
    { scale: 1.2 - phase.value * 0.7 },
  ]);
  const twinkleAOpacity = useDerivedValue(() => 0.4 + phase.value * 0.6);
  const twinkleBOpacity = useDerivedValue(() => 1 - phase.value * 0.6);

  return (
    <Canvas style={{ width: SIZE, height: SIZE }}>
      <Group transform={coinTransform}>
        <Circle cx={CENTER} cy={CENTER} r={COIN_RADIUS + 5} color={colors.accentTint} />
        <Circle cx={CENTER} cy={CENTER} r={COIN_RADIUS}>
          <LinearGradient
            start={vec(CENTER - COIN_RADIUS, CENTER - COIN_RADIUS)}
            end={vec(CENTER + COIN_RADIUS, CENTER + COIN_RADIUS)}
            colors={[colors.accentText, colors.accent]}
          />
        </Circle>
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={COIN_RADIUS - 5}
          style="stroke"
          strokeWidth={1.5}
          color={colors.onAccentHairline}
        />
        <Group transform={sparkleTransform} origin={{ x: CENTER, y: CENTER }}>
          <Path path={mainSparkle} color={colors.onAccent} />
        </Group>
      </Group>
      <Group transform={twinkleATransform} opacity={twinkleAOpacity}>
        <Path path={twinkleLarge} color={colors.accentText} />
      </Group>
      <Group transform={twinkleBTransform} opacity={twinkleBOpacity}>
        <Path path={twinkleSmall} color={colors.accentText} />
      </Group>
    </Canvas>
  );
}
