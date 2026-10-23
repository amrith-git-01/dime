import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Pie, PolarChart } from "victory-native";

import { COUNTERPARTY_DONUT_INNER_RADIUS_RATIO } from "@/features/analytics/constants/counterpartyDonut";
import type { CounterpartyDonutDatum } from "@/features/analytics/utils/buildCounterpartyDonutData";
import { useTheme } from "@/theme";

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
  const { colors } = useTheme();
  const angularInset = showSliceGaps
    ? {
        angularStrokeWidth: SLICE_GAP_PX,
        angularStrokeColor: colors.bento.twoToneBodySurface,
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

/** Neutral donut ring when there are no payees. */
export const PayeeDonutEmptyChart = memo(function PayeeDonutEmptyChart({
  size = 168,
  innerRadiusRatio = COUNTERPARTY_DONUT_INNER_RADIUS_RATIO,
}: PayeeDonutEmptyChartProps) {
  const { colors } = useTheme();
  const emptyRow = useMemo<CounterpartyDonutDatum[]>(
    () => [
      {
        label: "empty",
        value: 1,
        color: colors.donut.other,
        payee_key: "__empty__",
        display_name: "",
        share: 0,
        amount: 0,
        transaction_count: 0,
      },
    ],
    [colors.donut.other],
  );
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <PayeeVictoryDonut
        data={emptyRow}
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
