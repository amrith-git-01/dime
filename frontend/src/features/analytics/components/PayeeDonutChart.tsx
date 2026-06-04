import { memo, useMemo, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";

import type { ChartTooltipAnchor } from "@/components/shared";
import { bento } from "@/constants";
import type { CounterpartyDonutDatum } from "@/features/analytics/utils/buildCounterpartyDonutData";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

const DEG = Math.PI / 180;
const STROKE_GAP_DEG = 1.25;
/** Small window anchor at the tap point (same idea as a cash-flow day hit cell). */
const TOUCH_ANCHOR_SIZE = 32;

type PayeeDonutChartProps = {
  data: CounterpartyDonutDatum[];
  size?: number;
  innerRadiusRatio?: number;
  onSlicePress?: (
    slice: CounterpartyDonutDatum,
    anchor: ChartTooltipAnchor,
  ) => void;
};

type SliceArc = {
  datum: CounterpartyDonutDatum;
  path: string;
};

function polarToXY(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = (angleDeg - 90) * DEG;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function describeAnnularSlice(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  if (sweep >= 359.99) {
    const mid = polarToXY(cx, cy, outerR, 0);
    const midInner = polarToXY(cx, cy, innerR, 0);
    const bottom = polarToXY(cx, cy, outerR, 180);
    const bottomInner = polarToXY(cx, cy, innerR, 180);
    return [
      `M ${mid.x} ${mid.y}`,
      `A ${outerR} ${outerR} 0 1 1 ${bottom.x} ${bottom.y}`,
      `A ${outerR} ${outerR} 0 1 1 ${mid.x} ${mid.y}`,
      `L ${midInner.x} ${midInner.y}`,
      `A ${innerR} ${innerR} 0 1 0 ${bottomInner.x} ${bottomInner.y}`,
      `A ${innerR} ${innerR} 0 1 0 ${midInner.x} ${midInner.y}`,
      "Z",
    ].join(" ");
  }

  const largeArc = sweep > 180 ? 1 : 0;
  const outerStart = polarToXY(cx, cy, outerR, startAngle);
  const outerEnd = polarToXY(cx, cy, outerR, endAngle);
  const innerEnd = polarToXY(cx, cy, innerR, endAngle);
  const innerStart = polarToXY(cx, cy, innerR, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function buildSliceArcs(
  data: CounterpartyDonutDatum[],
  size: number,
  innerRadiusRatio: number,
): SliceArc[] {
  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) {
    return [];
  }

  const cx = size / 2;
  const cy = size / 2;
  const pad = 2;
  const outerR = size / 2 - pad;
  const innerR = outerR * innerRadiusRatio;
  const gapTotal = data.length > 1 ? STROKE_GAP_DEG * data.length : 0;
  const drawable = 360 - gapTotal;

  let cursor = data.length > 1 ? STROKE_GAP_DEG / 2 : 0;
  return data.map((datum) => {
    const sweep = (datum.value / total) * drawable;
    const startAngle = cursor;
    const endAngle = startAngle + sweep;
    cursor = endAngle + (data.length > 1 ? STROKE_GAP_DEG : 0);
    return {
      datum,
      path: describeAnnularSlice(cx, cy, outerR, innerR, startAngle, endAngle),
    };
  });
}

/** Map touch coords to a slice (SVG Path onPress is unreliable inside ScrollView). */
function hitTestDonutSlice(
  locationX: number,
  locationY: number,
  data: CounterpartyDonutDatum[],
  size: number,
  innerRadiusRatio: number,
): CounterpartyDonutDatum | null {
  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) {
    return null;
  }

  const cx = size / 2;
  const cy = size / 2;
  const dx = locationX - cx;
  const dy = locationY - cy;
  const dist = Math.hypot(dx, dy);
  const pad = 2;
  const outerR = size / 2 - pad;
  const innerR = outerR * innerRadiusRatio;
  if (dist < innerR || dist > outerR) {
    return null;
  }

  let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (angleDeg < 0) {
    angleDeg += 360;
  }

  const gapTotal = data.length > 1 ? STROKE_GAP_DEG * data.length : 0;
  const drawable = 360 - gapTotal;
  let cursor = data.length > 1 ? STROKE_GAP_DEG / 2 : 0;

  for (const datum of data) {
    const sweep = (datum.value / total) * drawable;
    const startAngle = cursor;
    const endAngle = startAngle + sweep;
    if (angleDeg >= startAngle && angleDeg <= endAngle) {
      return datum;
    }
    cursor = endAngle + (data.length > 1 ? STROKE_GAP_DEG : 0);
  }

  return null;
}

export const PayeeDonutChart = memo(function PayeeDonutChart({
  data,
  size = 168,
  innerRadiusRatio = 0.56,
  onSlicePress,
}: PayeeDonutChartProps) {
  const wrapRef = useRef<View>(null);
  const arcs = useMemo(
    () => buildSliceArcs(data, size, innerRadiusRatio),
    [data, innerRadiusRatio, size],
  );

  if (arcs.length === 0) {
    return <View style={{ width: size, height: size }} />;
  }

  return (
    <View
      ref={wrapRef}
      collapsable={false}
      style={[styles.wrap, { width: size, height: size }]}
    >
      <Svg width={size} height={size} pointerEvents="none">
        <G>
          {arcs.map(({ datum, path }) => (
            <Path
              key={datum.payee_key}
              d={path}
              fill={datum.color}
              opacity={0.94}
              stroke={bento.twoToneBodySurface}
              strokeWidth={1.5}
            />
          ))}
        </G>
      </Svg>
      {onSlicePress ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Donut chart slice"
          onPress={(event) => {
            const { locationX, locationY } = event.nativeEvent;
            const slice = hitTestDonutSlice(
              locationX,
              locationY,
              data,
              size,
              innerRadiusRatio,
            );
            if (!slice) {
              return;
            }
            void triggerLightHaptic();
            wrapRef.current?.measureInWindow((chartX, chartY) => {
              const half = TOUCH_ANCHOR_SIZE / 2;
              onSlicePress(slice, {
                x: chartX + locationX - half,
                y: chartY + locationY - half,
                width: TOUCH_ANCHOR_SIZE,
                height: TOUCH_ANCHOR_SIZE,
              });
            });
          }}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
