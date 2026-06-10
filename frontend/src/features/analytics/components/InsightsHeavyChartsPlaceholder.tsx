import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { TwoToneCard } from "@/components/shared";
import { colors } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import {
  InsightsCashflowChartSkeleton,
  InsightsDonutCardSkeleton,
  InsightsTopExpensesSkeleton,
} from "./InsightsAnalyticsSkeletons";
import { InsightsBurnRateMetricCard } from "./InsightsBurnRateMetricCard";

/** Lightweight placeholders — no Victory/Skia mount. */
export const InsightsHeavyChartsPlaceholder = memo(
  function InsightsHeavyChartsPlaceholder() {
    return (
      <>
        <InsightsBurnRateMetricCard metrics={null} loading />
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

const styles = StyleSheet.create({
  header: {
    gap: 2,
  },
  headerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textListPrimary,
  },
  headerSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textListSecondary,
  },
});
