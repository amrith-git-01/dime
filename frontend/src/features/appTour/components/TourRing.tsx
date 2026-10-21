import { Circle } from "@shopify/react-native-skia";
import { memo } from "react";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

export type TourRingProps = {
  /** Where the ring starts, in overlay coordinates. */
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** Milliseconds since it started; the ring is a pure function of it (idle when past `durationMs`). */
  clock: SharedValue<number>;
  durationMs: number;
  fromRadius: number;
  toRadius: number;
  strokeWidth: number;
  /** Opacity at the start; it fades to nothing by the end. */
  opacity: number;
  color: string;
};

/**
 * A ring that grows from a point and fades as it goes: the ripple at a target when a "Do" step
 * succeeds (small and quick) and the zoom-through when the tour moves to another screen (wide).
 * Render it inside the scrim's Skia canvas.
 */
export const TourRing = memo(function TourRing({
  x,
  y,
  clock,
  durationMs,
  fromRadius,
  toRadius,
  strokeWidth,
  opacity,
  color,
}: TourRingProps) {
  const progress = useDerivedValue(() =>
    Math.min(1, Math.max(0, clock.value / durationMs)),
  );
  const radius = useDerivedValue(() => {
    const eased = 1 - Math.pow(1 - progress.value, 3);
    return fromRadius + (toRadius - fromRadius) * eased;
  });
  const ringOpacity = useDerivedValue(() =>
    clock.value <= 0 || progress.value >= 1
      ? 0
      : (1 - progress.value) * opacity,
  );

  return (
    <Circle
      cx={x}
      cy={y}
      r={radius}
      style="stroke"
      strokeWidth={strokeWidth}
      color={color}
      opacity={ringOpacity}
    />
  );
});
