import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Pie, PolarChart } from "victory-native";

import { bento } from "@/constants";
import { COUNTERPARTY_DONUT_INNER_RADIUS_RATIO } from "@/features/analytics/constants/counterpartyDonut";
import { COUNTERPARTY_DONUT_OTHER_COLOR } from "@/features/analytics/constants/counterpartyDonutColors";
import type { CounterpartyDonutDatum } from "@/features/analytics/utils/buildCounterpartyDonutData";

const DONUT_START_ANGLE = -90;
const SLICE_GAP_PX = 2;

type PayeeVictoryDonutProps = {
  data: CounterpartyDonutDatum[];
  size: number;
  innerRadius: string;
  showSliceGaps: boolean;
  sliceOpacity?: number;
};

const PayeeVictoryDonut = memo(function PayeeVictoryDonut({
  data,
  size,
  innerRadius,
  showSliceGaps,
  sliceOpacity = 0.94,
}: PayeeVictoryDonutProps) {
  const angularInset = showSliceGaps
    ? {
        angularStrokeWidth: SLICE_GAP_PX,
        angularStrokeColor: bento.twoToneBodySurface,
      }
    : null;

  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) {
    return <View style={{ width: size, height: size }} />;
  }

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
          <Pie.Slice opacity={sliceOpacity}>
            {angularInset ? (
              <Pie.SliceAngularInset angularInset={angularInset} />
            ) : null}
          </Pie.Slice>
        )}
      </Pie.Chart>
    </PolarChart>
  );
});

export type PayeeDonutEmptyChartProps = {
  size?: number;
  innerRadiusRatio?: number;
};

const EMPTY_DONUT_ROW: CounterpartyDonutDatum[] = [
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

/** Neutral donut ring when there is no payee spend. */
export const PayeeDonutEmptyChart = memo(function PayeeDonutEmptyChart({
  size = 168,
  innerRadiusRatio = COUNTERPARTY_DONUT_INNER_RADIUS_RATIO,
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
