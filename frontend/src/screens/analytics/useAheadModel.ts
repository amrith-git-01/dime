import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";

import { isCurrentMonth } from "@/features/analytics/utils/buildCashflowWindow";
import { usePredictionFeedback } from "@/features/forecast/hooks/usePredictionFeedback";
import { useForecastQuery } from "@/features/forecast/hooks/useForecastQuery";
import type {
  ForecastActions,
  ForecastResponse,
  ForecastWatchItem,
  PredictionFeedbackInput,
} from "@/features/forecast/types";
import { toRupees } from "@/features/forecast/utils/forecastFormat";
import { useToast } from "@/features/toast/useToast";
import { isTourSampleId } from "@/features/tourPreview";
import { fetchTransactionById } from "@/features/transactions/api/transactionsApi";
import type { TransactionRow } from "@/features/transactions/types";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";

type AheadNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Insights">,
  NativeStackNavigationProp<MainStackParamList>
>;

type UseAheadModelArgs = {
  navigation: AheadNavigation;
  year: number;
  monthIndex0: number;
  /** Payments already on screen, so an unusual spend among them opens without a fetch. */
  knownTransactions: readonly TransactionRow[];
};

/**
 * The Insights "Ahead" section: the forecast of the current month (nothing for any other
 * month), what the user's taps do (answer a prediction, open a payment or category, start a
 * recurring item) and the month-end figure the summary card projects with.
 */
export function useAheadModel({
  navigation,
  year,
  monthIndex0,
  knownTransactions,
}: UseAheadModelArgs) {
  const forecastQuery = useForecastQuery(year, monthIndex0);
  const { mutate: answer } = usePredictionFeedback();
  const { showToast } = useToast();

  // The day ticks over at midnight, so a month that ends while the app is open stops looking ahead.
  const visible = isCurrentMonth(year, monthIndex0, useCurrentDay());
  const forecast: ForecastResponse | undefined = visible
    ? forecastQuery.data
    : undefined;
  const loading = visible && forecast === undefined && !forecastQuery.isError;
  const failed = visible && forecast === undefined && forecastQuery.isError;
  const { refetch } = forecastQuery;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Rough figure for the summary: the middle of the range, once the forecast has learned enough to give one.
  const landing =
    forecast && forecast.mode !== "learning" ? toRupees(forecast.landing.p50) : 0;
  const projectedSpend = landing > 0 ? landing : null;

  const openTransaction = useCallback(
    async (transactionId: string | undefined) => {
      if (!transactionId) return;
      const known = knownTransactions.find((row) => row.id === transactionId);
      if (known) {
        navigation.navigate("TransactionDetail", { transaction: known });
        return;
      }
      if (isTourSampleId(transactionId)) return;
      try {
        const transaction = await fetchTransactionById(transactionId);
        navigation.navigate("TransactionDetail", { transaction });
      } catch (error) {
        showToast({ variant: "error", message: parseFastApiError(error) });
      }
    },
    [knownTransactions, navigation, showToast],
  );

  const openCategory = useCallback(
    (categoryId: string, name: string) => {
      navigation.navigate("TransactionsList", {
        filter: "category",
        year,
        monthIndex0,
        categoryId,
        categoryDisplayName: name,
      });
    },
    [monthIndex0, navigation, year],
  );

  const actions = useMemo<ForecastActions>(() => {
    const categoryName = (categoryId: string) =>
      forecast?.categories.find((category) => category.id === categoryId)
        ?.name ?? "Category";
    // Sample cards from the guided tour are only looked at, never answered.
    const answerable = (item: { id: string }) => !isTourSampleId(item.id);
    const watchAnswer = (
      item: ForecastWatchItem,
      input: PredictionFeedbackInput,
    ) => {
      if (answerable(item)) answer(input);
    };
    return {
      onConfirmLikely: (item) => {
        if (!item.payeeKey || !answerable(item)) return;
        answer({ targetKind: "payee", targetId: item.payeeKey, verdict: "confirm" });
        showToast({ variant: "success", message: "Got it. Dime will count on it." });
      },
      onDismissLikely: (item) => {
        if (!item.payeeKey || !answerable(item)) return;
        answer({ targetKind: "payee", targetId: item.payeeKey, verdict: "dismiss" });
      },
      onSeeCategoryTransactions: (item) => {
        if (item.categoryId) {
          openCategory(item.categoryId, categoryName(item.categoryId));
        }
      },
      onDismissCategoryWatch: (item) => {
        if (!item.categoryId) return;
        watchAnswer(item, {
          targetKind: "category_watch",
          targetId: item.categoryId,
          verdict: "dismiss",
        });
      },
      onOpenUnusual: (item) => {
        void openTransaction(item.transactionId);
      },
      onMarkOneOff: (item) => {
        if (!item.transactionId) return;
        watchAnswer(item, {
          targetKind: "unusual_txn",
          targetId: item.transactionId,
          verdict: "one_off",
        });
      },
      onMarkNotUnusual: (item) => {
        if (!item.transactionId) return;
        watchAnswer(item, {
          targetKind: "unusual_txn",
          targetId: item.transactionId,
          verdict: "not_one_off",
        });
      },
      onTrackRecurring: (item) => {
        if (!item.payeeKey || !answerable(item)) return;
        // Not confirmed yet: the editor does that once the item is saved.
        navigation.navigate("RecurringEditor", {
          kind: "subscription",
          prefill: {
            ...(item.name ? { name: item.name } : {}),
            ...(item.amount ? { amount: item.amount } : {}),
            ...(item.dayOfMonth ? { dayOfMonth: item.dayOfMonth } : {}),
            ...(item.cadence ? { cadence: item.cadence } : {}),
            feedbackPayeeKey: item.payeeKey,
          },
        });
      },
      onDismissSubscription: (item) => {
        if (!item.payeeKey) return;
        watchAnswer(item, {
          targetKind: "subscription_candidate",
          targetId: item.payeeKey,
          verdict: "dismiss",
        });
      },
      onOpenCategory: (category) => {
        if (category.id) openCategory(category.id, category.name);
      },
    };
  }, [
    answer,
    forecast?.categories,
    navigation,
    openCategory,
    openTransaction,
    showToast,
  ]);

  return { visible, forecast, loading, failed, retry, projectedSpend, actions };
}
