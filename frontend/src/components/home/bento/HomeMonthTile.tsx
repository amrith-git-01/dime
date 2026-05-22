import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/constants";

import { BentoProgressRing } from "./BentoProgressRing";
import { HomeSpendBentoTile } from "./HomeSpendBentoTile";

const MONTH_RING_SIZE = 80;
const MONTH_RING_STROKE = 7;

type HomeMonthTileProps = {
  monthLabel: string;
  spentAmount: string;
  subtext: string;
  monthlyProgress: number;
  hasMonthlyBudget: boolean;
  onAddMonthlyBudget: () => void;
};

/** Spent this month — progress ring in shared spend bento shell. */
export const HomeMonthTile = memo(function HomeMonthTile({
  monthLabel,
  spentAmount,
  subtext,
  monthlyProgress,
  hasMonthlyBudget,
  onAddMonthlyBudget,
}: HomeMonthTileProps) {
  return (
    <HomeSpendBentoTile
      variant="month"
      title="Spent this month"
      periodLabel={monthLabel}
      amount={spentAmount}
      subtext={subtext}
      hasBudget={hasMonthlyBudget}
      onAddBudget={onAddMonthlyBudget}
      addBudgetLabel="Add monthly budget"
      addBudgetAccessibilityLabel="Add monthly budget"
      bodyStyle={styles.ringWrap}
    >
      <View pointerEvents="none">
        <BentoProgressRing
          progress={monthlyProgress}
          size={MONTH_RING_SIZE}
          strokeWidth={MONTH_RING_STROKE}
          showLabel
          variant="light"
        />
      </View>
    </HomeSpendBentoTile>
  );
});

const styles = StyleSheet.create({
  ringWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: MONTH_RING_SIZE + spacing.sm,
    marginVertical: spacing.xs,
  },
});
