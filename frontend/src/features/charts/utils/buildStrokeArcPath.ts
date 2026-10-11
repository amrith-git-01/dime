import { Skia, type SkPath } from "@shopify/react-native-skia";

/** Open arc for stroke-only rings (progress indicators). */
export function buildStrokeArcPath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  sweepAngle: number,
): SkPath {
  "worklet";
  const path = Skia.Path.Make();
  if (sweepAngle <= 0) {
    return path;
  }
  path.addArc(
    Skia.XYWHRect(centerX - radius, centerY - radius, radius * 2, radius * 2),
    startAngle,
    sweepAngle,
  );
  return path;
}
