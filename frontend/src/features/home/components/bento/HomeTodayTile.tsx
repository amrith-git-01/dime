import { memo } from "react";
import { StyleSheet } from "react-native";

import { spacing } from "@/constants";

import { BentoSevenDayBarChart } from "./BentoSevenDayBarChart";
import { HomeSpendBentoTile } from "./HomeSpendBentoTile";
import {
  HOME_SPEND_CHART_BAR_HEIGHT,
  HOME_SPEND_RING_SIZE,
} from "./homeBentoTokens";

type HomeTodayTileProps = {
  dayLabel: string;
  spentAmount: string;
  subtext: string;
  last7DaysSpend: { date: string; total: number }[];
  hasDailyBudget: boolean;
  onAddDailyBudget: () => void;
};

/** Spent Today — 7-day chart in shared spend bento shell. */
export const HomeTodayTile = memo(function HomeTodayTile({
  dayLabel,
  spentAmount,
  subtext,
  last7DaysSpend,
  hasDailyBudget,
  onAddDailyBudget,
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
      bodyStyle={styles.chartWrap}
    >
      <BentoSevenDayBarChart
        days={last7DaysSpend}
        height={HOME_SPEND_CHART_BAR_HEIGHT}
      />
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
