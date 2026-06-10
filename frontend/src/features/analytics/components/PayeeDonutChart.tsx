import { memo, useMemo, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Pie, PolarChart } from "victory-native";

import type { ChartTooltipAnchor } from "@/components/shared";
import { bento } from "@/constants";
import {
  INSIGHTS_CHART_PIE_ANIMATION,
  type ChartPathAnimationConfig,
} from "@/features/analytics/constants/chartAnimation";
import { COUNTERPARTY_DONUT_OTHER_COLOR } from "@/features/analytics/constants/counterpartyDonutColors";
import { useChartPathAnimation } from "@/features/analytics/hooks/useChartPathAnimation";
import type { CounterpartyDonutDatum } from "@/features/analytics/utils/buildCounterpartyDonutData";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

const DONUT_START_ANGLE = -90;
const SLICE_GAP_PX = 2;
const TOUCH_ANCHOR_SIZE = 32;

type PayeePolarDatum = CounterpartyDonutDatum;

export type PayeeDonutChartProps = {
  data: CounterpartyDonutDatum[];
  size?: number;
  innerRadiusRatio?: number;
  /** When set, plays Victory slice animation once per key (tab focus / month). */
  animationKey?: string;
  onSlicePress?: (
    slice: CounterpartyDonutDatum,
    anchor: ChartTooltipAnchor,
  ) => void;
};

function hitTestVictoryDonutSlice(
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
  const outerR = size / 2;
  const innerR = outerR * innerRadiusRatio;
  if (dist < innerR || dist > outerR) {
    return null;
  }

  const touchAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
  let cursor = DONUT_START_ANGLE;

  for (const datum of data) {
    const sweep = (datum.value / total) * 360;
    const start = cursor;
    const end = cursor + sweep;
    if (touchAngle >= start && touchAngle < end) {
      return datum;
    }
    cursor = end;
  }

  return null;
}

type PayeeVictoryDonutProps = {
  data: PayeePolarDatum[];
  size: number;
  innerRadius: string;
  sliceAnimate?: ChartPathAnimationConfig;
  showSliceGaps: boolean;
  sliceOpacity?: number;
};

const PayeeVictoryDonut = memo(function PayeeVictoryDonut({
  data,
  size,
  innerRadius,
  sliceAnimate,
  showSliceGaps,
  sliceOpacity = 0.94,
}: PayeeVictoryDonutProps) {
  const angularInset = useMemo(
    () =>
      showSliceGaps
        ? {
            angularStrokeWidth: SLICE_GAP_PX,
            angularStrokeColor: bento.twoToneBodySurface,
          }
        : null,
    [showSliceGaps],
  );

  return (
    <PolarChart
      data={data}
      labelKey="label"
      valueKey="value"
      colorKey="color"
      containerStyle={{ width: size, height: size }}
      canvasStyle={{ width: size, height: size }}
    >
      <Pie.Chart
        size={size}
        innerRadius={innerRadius}
        startAngle={DONUT_START_ANGLE}
      >
        {() => (
          <Pie.Slice animate={sliceAnimate} opacity={sliceOpacity}>
            {angularInset ? (
              <Pie.SliceAngularInset
                angularInset={angularInset}
                animate={sliceAnimate}
              />
            ) : null}
          </Pie.Slice>
        )}
      </Pie.Chart>
    </PolarChart>
  );
});

export const PayeeDonutChart = memo(function PayeeDonutChart({
  data,
  size = 168,
  innerRadiusRatio = 0.56,
  animationKey,
  onSlicePress,
}: PayeeDonutChartProps) {
  const wrapRef = useRef<View>(null);
  const innerRadius = `${innerRadiusRatio * 100}%`;
  const sliceAnimate = useChartPathAnimation(
    animationKey ?? "payee-donut-static",
    INSIGHTS_CHART_PIE_ANIMATION,
  );

  if (data.length === 0) {
    return <View style={{ width: size, height: size }} />;
  }

  return (
    <View
      ref={wrapRef}
      collapsable={false}
      style={[styles.wrap, { width: size, height: size }]}
    >
      <PayeeVictoryDonut
        data={data}
        size={size}
        innerRadius={innerRadius}
        sliceAnimate={animationKey ? sliceAnimate : undefined}
        showSliceGaps={data.length > 1}
      />

      {onSlicePress ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Donut chart slice"
          onPress={(event) => {
            const { locationX, locationY } = event.nativeEvent;
            const slice = hitTestVictoryDonutSlice(
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

export type PayeeDonutEmptyChartProps = {
  size?: number;
  innerRadiusRatio?: number;
};

const EMPTY_DONUT_ROW: PayeePolarDatum[] = [
  {
    label: "empty",
    value: 1,
    color: COUNTERPARTY_DONUT_OTHER_COLOR,
    payee_key: "__empty__",
    display_name: "",
    share: 0,
    debit_total: 0,
    transaction_count: 0,
  },
];

/** Neutral full ring when there is no payee spend. */
export const PayeeDonutEmptyChart = memo(function PayeeDonutEmptyChart({
  size = 168,
  innerRadiusRatio = 0.56,
}: PayeeDonutEmptyChartProps) {
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <PayeeVictoryDonut
        data={EMPTY_DONUT_ROW}
        size={size}
        innerRadius={`${innerRadiusRatio * 100}%`}
        showSliceGaps={false}
        sliceOpacity={0.35}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
});
