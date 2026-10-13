import { ScrollView, Text, View } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { layout, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import {
  CompareCashflowSection,
  ComparePaceSection,
  ComparePayeeSection,
  CompareSnapshotCard,
  CompareSummarySection,
} from "@/features/analytics/components";
import {
  InsightsScrollVisibilityProvider,
  useInsightsScrollVisibility,
} from "@/features/analytics/hooks/useInsightsScrollVisibility";

import { useInsightsMonthCompareScreenModel } from "./useInsightsMonthCompareScreenModel";
import { createThemedStyles } from "@/theme";

function InsightsMonthCompareContent() {
  const styles = useStyles();
  const {
    monthA,
    monthB,
    spentDelta,
    bothFailed,
    monthASpent,
    monthBSpent,
    isDeltaPositive,
  } = useInsightsMonthCompareScreenModel();
  const { reportScroll } = useInsightsScrollVisibility();

  if (bothFailed) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not load comparison</Text>
          <Text style={styles.errorMessage}>
            Check your connection and try again from Insights.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={reportScroll}
      onScrollBeginDrag={reportScroll}
      onMomentumScrollEnd={reportScroll}
    >
      <CompareSnapshotCard
        leftLabel={monthB.label}
        rightLabel={monthA.label}
        leftAmount={monthBSpent}
        rightAmount={monthASpent}
        spentDelta={spentDelta}
        isDeltaPositive={isDeltaPositive}
      />

      <CompareSummarySection
        leftLabel={monthA.label}
        rightLabel={monthB.label}
        leftSummary={monthA.summary}
        rightSummary={monthB.summary}
        leftLoading={monthA.summaryLoading}
        rightLoading={monthB.summaryLoading}
        leftFailed={monthA.isError}
        rightFailed={monthB.isError}
        spentDelta={spentDelta}
      />

      <ComparePaceSection
        leftLabel={monthA.label}
        rightLabel={monthB.label}
        leftMetrics={monthA.burnRateMetrics}
        rightMetrics={monthB.burnRateMetrics}
        leftLoading={monthA.chartLoading}
        rightLoading={monthB.chartLoading}
        leftFailed={monthA.isError}
        rightFailed={monthB.isError}
      />

      <CompareCashflowSection
        leftLabel={monthA.label}
        rightLabel={monthB.label}
        leftCashflow={monthA.dailyCashflow}
        rightCashflow={monthB.dailyCashflow}
        leftYear={monthA.year}
        leftMonthIndex0={monthA.monthIndex0}
        rightYear={monthB.year}
        rightMonthIndex0={monthB.monthIndex0}
        leftLoading={monthA.chartLoading}
        rightLoading={monthB.chartLoading}
        leftFailed={monthA.isError}
        rightFailed={monthB.isError}
      />

      <ComparePayeeSection
        leftLabel={monthA.label}
        rightLabel={monthB.label}
        leftSpend={monthA.counterpartySpend}
        rightSpend={monthB.counterpartySpend}
        leftYear={monthA.year}
        leftMonthIndex0={monthA.monthIndex0}
        rightYear={monthB.year}
        rightMonthIndex0={monthB.monthIndex0}
        leftLoading={monthA.chartLoading}
        rightLoading={monthB.chartLoading}
        leftFailed={monthA.isError}
        rightFailed={monthB.isError}
      />
    </ScrollView>
  );
}

export default function InsightsMonthCompareScreen() {
  return (
    <InsightsScrollVisibilityProvider>
      <InsightsMonthCompareContent />
    </InsightsScrollVisibilityProvider>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  scroll: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  scrollContent: {
    ...layout.screenContent,
    gap: BENTO_SECTION_GAP,
    paddingTop: spacing.md,
    paddingBottom: BENTO_SECTION_GAP,
  },
  errorContainer: {
    flex: 1,
    padding: spacing.md,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.paper,
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...shadows.card,
    padding: spacing.lg,
    alignItems: "center",
    maxWidth: 320,
    width: "100%",
  },
  errorTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.danger,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  errorMessage: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    textAlign: "center",
  },
}));
