import { Canvas, Path, Skia, type SkPath } from "@shopify/react-native-skia";
import { memo, useMemo } from "react";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import type { CounterpartyDonutDatum } from "@/features/analytics/utils/buildCounterpartyDonutData";
import { buildPieSliceGeometry } from "@/features/analytics/utils/buildPieSliceGeometry";

const DONUT_START_ANGLE = -90;
const SLICE_OPACITY = 0.94;
/** Skia FillType.EvenOdd — worklet-safe literal for full-ring donut holes. */
const FILL_TYPE_EVEN_ODD = 1;
const FULL_CIRCLE_SWEEP = 359.99;

function buildAnimatedPieSlicePath(
  centerX: number,
  centerY: number,
  radius: number,
  innerRadius: number,
  startAngle: number,
  sweepAngle: number,
): SkPath {
  "worklet";
  const path = Skia.Path.Make();

  if (sweepAngle <= 0) {
    return path;
  }

  const outerRect = Skia.XYWHRect(
    centerX - radius,
    centerY - radius,
    radius * 2,
    radius * 2,
  );

  if (sweepAngle >= FULL_CIRCLE_SWEEP) {
    path.addOval(outerRect);
    if (innerRadius > 0) {
      path.addOval(
        Skia.XYWHRect(
          centerX - innerRadius,
          centerY - innerRadius,
          innerRadius * 2,
          innerRadius * 2,
        ),
      );
      path.setFillType(FILL_TYPE_EVEN_ODD);
    }
    return path;
  }

  path.arcToOval(outerRect, startAngle, sweepAngle, false);

  if (innerRadius > 0) {
    path.arcToOval(
      Skia.XYWHRect(
        centerX - innerRadius,
        centerY - innerRadius,
        innerRadius * 2,
        innerRadius * 2,
      ),
      startAngle + sweepAngle,
      -sweepAngle,
      false,
    );
  } else {
    path.lineTo(centerX, centerY);
  }

  path.close();
  return path;
}

type ClockwiseAnimatedPieSliceProps = {
  color: string;
  startAngle: number;
  targetSweep: number;
  index: number;
  sliceCount: number;
  progress: SharedValue<number>;
  centerX: number;
  centerY: number;
  radius: number;
  innerRadius: number;
};

const ClockwiseAnimatedPieSlice = memo(function ClockwiseAnimatedPieSlice({
  color,
  startAngle,
  targetSweep,
  index,
  sliceCount,
  progress,
  centerX,
  centerY,
  radius,
  innerRadius,
}: ClockwiseAnimatedPieSliceProps) {
  const path = useDerivedValue(() => {
    "worklet";
    const reveal = Math.min(
      1,
      Math.max(0, progress.value * sliceCount - index),
    );
    const sweep = targetSweep * reveal;
    return buildAnimatedPieSlicePath(
      centerX,
      centerY,
      radius,
      innerRadius,
      startAngle,
      sweep,
    );
  });

  return (
    <Path path={path} style="fill" color={color} opacity={SLICE_OPACITY} />
  );
});

export type ClockwiseAnimatedPieProps = {
  data: CounterpartyDonutDatum[];
  size: number;
  innerRadiusRatio: number;
  progress: SharedValue<number>;
};

export const ClockwiseAnimatedPie = memo(function ClockwiseAnimatedPie({
  data,
  size,
  innerRadiusRatio,
  progress,
}: ClockwiseAnimatedPieProps) {
  const geometry = useMemo(
    () => buildPieSliceGeometry(data, DONUT_START_ANGLE),
    [data],
  );

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2;
  const innerRadius = radius * innerRadiusRatio;
  const sliceCount = geometry.length;

  if (sliceCount === 0) {
    return null;
  }

  return (
    <Canvas style={{ width: size, height: size }}>
      {geometry.map((sliceGeometry, index) => (
        <ClockwiseAnimatedPieSlice
          key={sliceGeometry.key}
          color={sliceGeometry.color}
          startAngle={sliceGeometry.startAngle}
          targetSweep={sliceGeometry.targetSweep}
          index={index}
          sliceCount={sliceCount}
          progress={progress}
          centerX={centerX}
          centerY={centerY}
          radius={radius}
          innerRadius={innerRadius}
        />
      ))}
    </Canvas>
  );
});
