import type { CounterpartyDonutDatum } from "@/features/analytics/utils/buildCounterpartyDonutData";

export type PieSliceGeometry = {
  key: string;
  startAngle: number;
  targetSweep: number;
  color: string;
};

/** Fixed clockwise layout — angles do not shrink when later slices reveal. */
export function buildPieSliceGeometry(
  data: CounterpartyDonutDatum[],
  startAngle = -90,
): PieSliceGeometry[] {
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return [];
  }

  let cursor = startAngle;
  return data.map((datum) => {
    const targetSweep = (datum.value / total) * 360;
    const geometry: PieSliceGeometry = {
      key: datum.payee_key,
      startAngle: cursor,
      targetSweep,
      color: datum.color,
    };
    cursor += targetSweep;
    return geometry;
  });
}
