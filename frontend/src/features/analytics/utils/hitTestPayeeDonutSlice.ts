import type { CounterpartyDonutDatum } from "@/features/analytics/utils/buildCounterpartyDonutData";

const DONUT_START_ANGLE = -90;

function normalizeAngleRelativeToStart(
  touchAngle: number,
  startAngle: number,
): number {
  let relative = touchAngle - startAngle;
  while (relative < 0) {
    relative += 360;
  }
  while (relative >= 360) {
    relative -= 360;
  }
  return relative;
}

export function hitTestPayeeDonutSlice(
  locationX: number,
  locationY: number,
  data: CounterpartyDonutDatum[],
  size: number,
  innerRadiusRatio: number,
): CounterpartyDonutDatum | null {
  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0 || data.length === 0) {
    return null;
  }

  const cx = size / 2;
  const cy = size / 2;
  const dx = locationX - cx;
  const dy = locationY - cy;
  const dist = Math.hypot(dx, dy);
  const outerR = size / 2;
  const innerR = outerR * innerRadiusRatio;
  if (dist < innerR || dist > outerR) {
    return null;
  }

  const touchAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const relativeTouch = normalizeAngleRelativeToStart(
    touchAngle,
    DONUT_START_ANGLE,
  );

  let cursor = 0;
  for (let index = 0; index < data.length; index += 1) {
    const datum = data[index]!;
    const sweep = (datum.value / total) * 360;
    const isLast = index === data.length - 1;
    if (relativeTouch >= cursor && (isLast || relativeTouch < cursor + sweep)) {
      return datum;
    }
    cursor += sweep;
  }

  return data[data.length - 1] ?? null;
}
