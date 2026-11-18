import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useLayoutEffect, useMemo } from "react";

import type { InsightsMonthSummary } from "@/features/analytics/components";
import { useMonthInsightsQuery } from "@/features/analytics/hooks/useMonthInsightsQuery";
import { isPastMonth } from "@/features/analytics/utils/buildCashflowWindow";
import { withPendingInsightsSummary } from "@/features/analytics/utils/pendingInsightsOverlay";
import { buildInsightsMonthSummary } from "@/features/analytics/utils/buildInsightsMonthSummary";
import { formatSpentDelta } from "@/features/analytics/utils/compareMonths";
import { resolveMonthBudget } from "@/features/budgets/utils/monthBudget";
import { usePendingInMonth } from "@/features/outbox/hooks/usePendingInMonth";
import { useMonthSummaryQuery } from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type { MainStackParamList } from "@/navigation/types";

type CompareRoute = RouteProp<MainStackParamList, "InsightsMonthCompare">;

function useCompareMonthSide(
  year: number,
  monthIndex0: number,
  label: string,
) {
  const query = useMonthInsightsQuery(year, monthIndex0);
  // This month's own cap and budget numbers (a past month keeps the cap it had then), from the server.
  const monthSummaryQuery = useMonthSummaryQuery(year, monthIndex0);
  // Entries saved offline count in this month's numbers until the server has them (same overlay as Home / Budgets).
  const pending = usePendingInMonth(year, monthIndex0);
  const month = useMemo(
    () =>
      resolveMonthBudget(monthSummaryQuery.data, {
        pending,
        fixedSpend: monthSummaryQuery.data?.fixed_debit_total,
      }),
    [monthSummaryQuery.data, pending],
  );
  const rawSummary = useMemo(
    () => withPendingInsightsSummary(query.data?.summary, pending),
    [query.data?.summary, pending],
  );

  const summaryLoading =
    query.isPending || (monthSummaryQuery.isPending && monthSummaryQuery.data === undefined);
  const chartLoading = query.isPending;

  const summary = useMemo((): InsightsMonthSummary | null => {
    if (summaryLoading || query.isError) {
      return null;
    }
    return buildInsightsMonthSummary(
      rawSummary,
      month,
      isPastMonth(year, monthIndex0),
    );
  }, [
    month,
    monthIndex0,
    rawSummary,
    query.isError,
    summaryLoading,
    year,
  ]);

  const dailyCashflow = useMemo(
    () => query.data?.daily_cashflow ?? [],
    [query.data?.daily_cashflow],
  );

  return {
    label,
    year,
    monthIndex0,
    isLoading: query.isPending,
    isError: query.isError,
    summaryLoading,
    chartLoading,
    summary,
    dailyCashflow,
    counterpartySpend: query.data?.counterparty_spend ?? [],
    rawSummary,
  };
}

export function useInsightsMonthCompareScreenModel() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { params } = useRoute<CompareRoute>();

  const monthA = useCompareMonthSide(
    params.monthA.year,
    params.monthA.monthIndex0,
    params.monthA.label,
  );
  const monthB = useCompareMonthSide(
    params.monthB.year,
    params.monthB.monthIndex0,
    params.monthB.label,
  );

  // The header is narrow: two full month names ("September 2026 vs August 2026") would be cut off.
  const shortMonth = (label: string) => label.replace(/^([A-Za-z]{3})[A-Za-z]*/, "$1");
  const screenTitle = `${shortMonth(params.monthA.label)} vs ${shortMonth(params.monthB.label)}`;

  useLayoutEffect(() => {
    navigation.setOptions({ title: screenTitle });
  }, [navigation, screenTitle]);

  const spentDelta = useMemo(
    () => formatSpentDelta(monthA.rawSummary, monthB.rawSummary),
    [monthA.rawSummary, monthB.rawSummary],
  );

  const monthASpent = useMemo(
    () =>
      monthA.rawSummary
        ? Math.abs(Number.parseFloat(monthA.rawSummary.debit_total ?? "0"))
        : 0,
    [monthA.rawSummary],
  );

  const monthBSpent = useMemo(
    () =>
      monthB.rawSummary
        ? Math.abs(Number.parseFloat(monthB.rawSummary.debit_total ?? "0"))
        : 0,
    [monthB.rawSummary],
  );

  const isDeltaPositive = useMemo((): boolean | null => {
    if (!monthA.rawSummary || !monthB.rawSummary) return null;
    if (monthASpent < monthBSpent) return true;
    if (monthASpent > monthBSpent) return false;
    return null;
  }, [monthA.rawSummary, monthB.rawSummary, monthASpent, monthBSpent]);

  const bothFailed = monthA.isError && monthB.isError;

  return {
    monthA,
    monthB,
    spentDelta,
    bothFailed,
    monthASpent,
    monthBSpent,
    isDeltaPositive,
  };
}
