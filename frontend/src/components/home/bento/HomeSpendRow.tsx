import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { HomeMonthTile } from "./HomeMonthTile";
import { HomeTodayTile } from "./HomeTodayTile";
import { HOME_BENTO_GAP, HOME_SPEND_ROW_MIN_HEIGHT } from "./homeBentoTokens";

export type HomeSpendRowProps = {
  spentTodayDisplay: string;
  spentMonthDisplay: string;
  dayLabel: string;
  monthLabel: string;
  dailySubtext: string;
  monthlySubtext: string;
  monthlyProgress: number;
  showMonthlyRing: boolean;
  hasBudget: boolean;
  last7DaysSpend: { date: string; total: number }[];
  onNavigateBudgets: () => void;
};

/**
 * Side-by-side spend row (40 / 60).
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
  showMonthlyRing,
  hasBudget,
  last7DaysSpend,
  onNavigateBudgets,
}: HomeSpendRowProps) {
  return (
    <View style={styles.row}>
      <HomeTodayTile
        dayLabel={dayLabel}
        spentAmount={spentTodayDisplay}
        subtext={dailySubtext}
        last7DaysSpend={last7DaysSpend}
        isLoading={false}
      />

      <HomeMonthTile
        monthLabel={monthLabel}
        spentAmount={spentMonthDisplay}
        subtext={monthlySubtext}
        monthlyProgress={monthlyProgress}
        showRing={showMonthlyRing}
        hasBudget={hasBudget}
        isLoading={false}
        onNavigateBudgets={onNavigateBudgets}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: HOME_BENTO_GAP,
    minHeight: HOME_SPEND_ROW_MIN_HEIGHT,
  },
});
