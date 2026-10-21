import { useEffect, useId } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { useTheme } from "@/theme";

import type { TourMotion } from "../utils/tourMotion";

const SIZE = 96;
const CENTER = SIZE / 2;
const COIN_RADIUS = 30;

/** Four-point sparkle with concave sides, centered on (cx, cy). */
function sparklePath(cx: number, cy: number, radius: number): string {
  const pinch = radius * 0.16;
  return [
    `M${cx} ${cy - radius}`,
    `Q${cx + pinch} ${cy - pinch} ${cx + radius} ${cy}`,
    `Q${cx + pinch} ${cy + pinch} ${cx} ${cy + radius}`,
    `Q${cx - pinch} ${cy + pinch} ${cx - radius} ${cy}`,
    `Q${cx - pinch} ${cy - pinch} ${cx} ${cy - radius}`,
    "Z",
  ].join(" ");
}

export type TourDimeMarkProps = {
  motion: TourMotion;
};

/**
 * The welcome card's hero: a small Dime coin with a sparkle that floats, with twinkling stars.
 * Drawn with SVG and Reanimated (no Skia canvas: the tour keeps one GL surface, its scrim).
 */
export function TourDimeMark({ motion }: TourDimeMarkProps) {
  const { colors } = useTheme();
  const phase = useSharedValue(0);
  const gradientId = `tourCoin${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

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
    return () => cancelAnimation(phase);
  }, [motion.sparkle, phase]);

  const coinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -3 + phase.value * 6 }],
  }));
  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${(phase.value - 0.5) * 0.5}rad` },
      { scale: 0.92 + phase.value * 0.16 },
    ],
  }));
  const twinkleAStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + phase.value * 0.6,
    transform: [{ scale: 0.5 + phase.value * 0.7 }],
  }));
  const twinkleBStyle = useAnimatedStyle(() => ({
    opacity: 1 - phase.value * 0.6,
    transform: [{ scale: 1.2 - phase.value * 0.7 }],
  }));

  const fill = { position: "absolute", left: 0, top: 0, width: SIZE, height: SIZE } as const;

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Animated.View style={[fill, coinStyle]}>
        <Svg width={SIZE} height={SIZE}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.accentText} />
              <Stop offset="1" stopColor={colors.accent} />
            </LinearGradient>
          </Defs>
          <Circle cx={CENTER} cy={CENTER} r={COIN_RADIUS + 5} fill={colors.accentTint} />
          <Circle cx={CENTER} cy={CENTER} r={COIN_RADIUS} fill={`url(#${gradientId})`} />
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={COIN_RADIUS - 5}
            fill="none"
            stroke={colors.onAccentHairline}
            strokeWidth={1.5}
          />
        </Svg>
        <Animated.View style={[fill, sparkleStyle]}>
          <Svg width={SIZE} height={SIZE}>
            <Path d={sparklePath(CENTER, CENTER, 17)} fill={colors.onAccent} />
          </Svg>
        </Animated.View>
      </Animated.View>
      <Animated.View
        style={[{ position: "absolute", left: 17 - 9, top: 20 - 9, width: 18, height: 18 }, twinkleAStyle]}
      >
        <Svg width={18} height={18}>
          <Path d={sparklePath(9, 9, 9)} fill={colors.accentText} />
        </Svg>
      </Animated.View>
      <Animated.View
        style={[
          { position: "absolute", left: SIZE - 15 - 6, top: SIZE - 24 - 6, width: 12, height: 12 },
          twinkleBStyle,
        ]}
      >
        <Svg width={12} height={12}>
          <Path d={sparklePath(6, 6, 6)} fill={colors.accentText} />
        </Svg>
      </Animated.View>
    </View>
  );
}
