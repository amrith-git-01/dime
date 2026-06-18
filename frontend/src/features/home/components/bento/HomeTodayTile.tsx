import { memo } from "react";
import { StyleSheet } from "react-native";

import { spacing } from "@/constants";

import { VictorySparkBarChart } from "@/features/charts";

import { BentoSevenDayBarChartSkeleton } from "./BentoSevenDayBarChartSkeleton";
import {
  HOME_SPEND_CHART_BAR_HEIGHT,
  HOME_SPEND_RING_SIZE,
} from "./homeBentoTokens";
import { HomeSpendBentoTile } from "./HomeSpendBentoTile";

type HomeTodayTileProps = {
  dayLabel: string;
  spentAmount: string;
  subtext: string;
  last7DaysSpend: { date: string; total: number }[];
  hasDailyBudget: boolean;
  onAddDailyBudget: () => void;
  isLoading?: boolean;
};

/** Spent Today — 7-day chart in shared spend bento shell. */
export const HomeTodayTile = memo(function HomeTodayTile({
  dayLabel,
  spentAmount,
  subtext,
  last7DaysSpend,
  hasDailyBudget,
  onAddDailyBudget,
  isLoading = false,
}: HomeTodayTileProps) {
  return (
    <HomeSpendBentoTile
      variant="today"
      title="Spent today"
      periodLabel={dayLabel}
      amount={spentAmount}
      subtext={subtext}
      hasBudget={hasDailyBudget}
      onAddBudget={onAddDailyBudget}
      addBudgetLabel="Add daily budget"
      addBudgetAccessibilityLabel="Add daily budget"
      isLoading={isLoading}
      bodyStyle={styles.chartWrap}
    >
      {isLoading ? (
        <BentoSevenDayBarChartSkeleton />
      ) : (
        <VictorySparkBarChart
          days={last7DaysSpend}
          height={HOME_SPEND_CHART_BAR_HEIGHT}
          revealIdentity={`home-bars-${last7DaysSpend.at(-1)?.date ?? "empty"}`}
          revealEnabled
        />
      )}
    </HomeSpendBentoTile>
  );
});

const styles = StyleSheet.create({
  chartWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: HOME_SPEND_RING_SIZE + spacing.sm,
    marginVertical: spacing.xs,
  },
});
