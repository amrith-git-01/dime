import { Canvas, Group, RoundedRect } from "@shopify/react-native-skia";
import { memo, useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

import {
  buildConfettiParticles,
  confettiOffset,
  CONFETTI_DURATION_MS,
  type ConfettiParticle,
} from "../utils/confettiParticles";

const PARTICLE_COUNT = 40;

type ConfettiPieceProps = {
  particle: ConfettiParticle;
  color: string;
  originX: number;
  originY: number;
  progress: SharedValue<number>;
};

const ConfettiPiece = memo(function ConfettiPiece({
  particle,
  color,
  originX,
  originY,
  progress,
}: ConfettiPieceProps) {
  const transform = useDerivedValue(() => {
    const { dx, dy } = confettiOffset(particle, progress.value);
    return [
      { translateX: originX + dx },
      { translateY: originY + dy },
      { rotate: particle.rotation + particle.spin * progress.value },
    ];
  });
  // Fully opaque for the first 60% of the burst, then fade out.
  const opacity = useDerivedValue(() =>
    Math.min(1, Math.max(0, (1 - progress.value) / 0.4)),
  );

  return (
    <Group transform={transform} opacity={opacity}>
      <RoundedRect
        x={-particle.width / 2}
        y={-particle.height / 2}
        width={particle.width}
        height={particle.height}
        r={1.5}
        color={color}
      />
    </Group>
  );
});

export type TourConfettiProps = {
  width: number;
  height: number;
  /** Where the burst starts, in overlay coordinates. */
  originX: number;
  originY: number;
};

/** A ~1.3s confetti burst drawn in Skia. Plays once on mount; touches pass through. */
export function TourConfetti({
  width,
  height,
  originX,
  originY,
}: TourConfettiProps) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  const palette = useMemo(
    () => [
      colors.accentText,
      colors.success,
      colors.warning,
      colors.iconAccentSky,
      colors.iconAccentOrange,
      colors.danger,
    ],
    [colors],
  );
  const particles = useMemo(
    () => buildConfettiParticles(PARTICLE_COUNT, palette.length),
    [palette.length],
  );

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: CONFETTI_DURATION_MS,
      // Linear time keeps the projectile arc physically plausible.
      easing: Easing.linear,
    });
  }, [progress]);

  return (
    <Canvas
      style={[StyleSheet.absoluteFill, { width, height }]}
      pointerEvents="none"
    >
      {particles.map((particle, index) => (
        <ConfettiPiece
          key={index}
          particle={particle}
          color={palette[particle.colorIndex] ?? colors.accentText}
          originX={originX}
          originY={originY}
          progress={progress}
        />
      ))}
    </Canvas>
  );
}
