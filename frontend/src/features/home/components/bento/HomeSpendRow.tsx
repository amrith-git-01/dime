import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { BENTO_GAP } from "@/components/bento";
import { HomeMonthTile } from "./HomeMonthTile";
import { HomeTodayTile } from "./HomeTodayTile";

import { HOME_SPEND_ROW_MIN_HEIGHT } from "./homeBentoTokens";

export type HomeSpendRowProps = {
  spentTodayDisplay: string;
  spentMonthDisplay: string;
  dayLabel: string;
  monthLabel: string;
  dailySubtext: string;
  monthlySubtext: string;
  monthlyProgress: number;
  hasMonthlyBudget: boolean;
  hasDailyBudget: boolean;
  last7DaysSpend: { date: string; total: number }[];
  onAddMonthlyBudget: () => void;
  onAddDailyBudget: () => void;
  isLoading?: boolean;
};

/**
 * Side-by-side spend row (45 / 55).
 * Both tiles: amount only + footer subtext; month adds centered ring.
 */
export const HomeSpendRow = memo(function HomeSpendRow({
  spentTodayDisplay,
  spentMonthDisplay,
  dayLabel,
  monthLabel,
  dailySubtext,
  monthlySubtext,
  monthlyProgress,
  hasMonthlyBudget,
  hasDailyBudget,
  last7DaysSpend,
  onAddMonthlyBudget,
  onAddDailyBudget,
  isLoading = false,
}: HomeSpendRowProps) {
  return (
    <View style={styles.row}>
      <HomeTodayTile
        dayLabel={dayLabel}
        spentAmount={spentTodayDisplay}
        subtext={dailySubtext}
        last7DaysSpend={last7DaysSpend}
        hasDailyBudget={hasDailyBudget}
        onAddDailyBudget={onAddDailyBudget}
        isLoading={isLoading}
      />

      <HomeMonthTile
        monthLabel={monthLabel}
        spentAmount={spentMonthDisplay}
        subtext={monthlySubtext}
        monthlyProgress={monthlyProgress}
        hasMonthlyBudget={hasMonthlyBudget}
        onAddMonthlyBudget={onAddMonthlyBudget}
        isLoading={isLoading}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: BENTO_GAP,
    minHeight: HOME_SPEND_ROW_MIN_HEIGHT,
  },
});
