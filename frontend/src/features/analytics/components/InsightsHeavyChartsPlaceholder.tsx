import { memo } from "react";
import { Text, View } from "react-native";

import { TwoToneCard } from "@/components/shared";
import { fontFamilies } from "@/constants/fonts";

import {
  InsightsCashflowChartSkeleton,
  InsightsDonutCardSkeleton,
  InsightsTopExpensesSkeleton,
} from "./InsightsAnalyticsSkeletons";
import { createThemedStyles } from "@/theme";

/** Lightweight placeholders — no Victory/Skia mount. */
export const InsightsHeavyChartsPlaceholder = memo(
  function InsightsHeavyChartsPlaceholder() {
    const styles = useStyles();
    return (
      <>
        <TwoToneCard
          header={
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Daily cash flow</Text>
              <Text style={styles.headerSubtitle}>
                Income, spending, and net each day
              </Text>
            </View>
          }
          body={<InsightsCashflowChartSkeleton />}
        />
        <TwoToneCard
          header={
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Who you paid</Text>
              <Text style={styles.headerSubtitle}>
                Spending by payee this month
              </Text>
            </View>
          }
          body={<InsightsDonutCardSkeleton />}
        />
        <TwoToneCard
          header={
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Top expenses</Text>
              <Text style={styles.headerSubtitle}>
                Largest debits this month
              </Text>
            </View>
          }
          body={<InsightsTopExpensesSkeleton />}
        />
      </>
    );
  },
);

const useStyles = createThemedStyles(({ colors }) => ({
  header: {
    gap: 2,
  },
  headerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  headerSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
}));
