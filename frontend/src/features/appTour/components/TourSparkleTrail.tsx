import { Path, Skia } from "@shopify/react-native-skia";
import { memo, useMemo } from "react";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import {
  buildTourSparkleSeeds,
  sparkleTrailFrame,
} from "../utils/tourSparkleTrail";

export type TourSparkleTrailProps = {
  fromX: SharedValue<number>;
  fromY: SharedValue<number>;
  toX: SharedValue<number>;
  toY: SharedValue<number>;
  /** Milliseconds since the hole started moving; the sparkles are a pure function of it. */
  clock: SharedValue<number>;
  color: string;
};

/**
 * A handful of four-point sparkles left along the spotlight's path as it glides between
 * targets, each shrinking away within about half a second. One Skia path for all of them;
 * render it inside the scrim's canvas.
 */
export const TourSparkleTrail = memo(function TourSparkleTrail({
  fromX,
  fromY,
  toX,
  toY,
  clock,
  color,
}: TourSparkleTrailProps) {
  const seeds = useMemo(() => buildTourSparkleSeeds(), []);

  const path = useDerivedValue(() => {
    const result = Skia.Path.Make();
    const from = { x: fromX.value, y: fromY.value };
    const to = { x: toX.value, y: toY.value };
    for (let i = 0; i < seeds.length; i += 1) {
      const frame = sparkleTrailFrame(seeds[i], clock.value, from, to);
      if (frame.radius <= 0.2) {
        continue;
      }
      // Four tips with concave sides: eight vertices alternating tip / pinch.
      const pinch = frame.radius * 0.3;
      for (let k = 0; k < 8; k += 1) {
        const angle = (k * Math.PI) / 4 - Math.PI / 2;
        const r = k % 2 === 0 ? frame.radius : pinch;
        const x = frame.x + Math.cos(angle) * r;
        const y = frame.y + Math.sin(angle) * r;
        if (k === 0) {
          result.moveTo(x, y);
        } else {
          result.lineTo(x, y);
        }
      }
      result.close();
    }
    return result;
  });

  return <Path path={path} color={color} />;
});
