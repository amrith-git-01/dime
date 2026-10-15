import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp, RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import type { LayoutChangeEvent } from "react-native";

import type { RecurringKindData } from "@/features/recurring/components";
import { useRecurringMonthQuery } from "@/features/recurring/hooks/useRecurringMonthQuery";
import { useRecurringQuery } from "@/features/recurring/hooks/useRecurringQuery";
import type {
  RecurringItem,
  RecurringKind,
  RecurringOccurrence,
} from "@/features/recurring/types";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";

type ScrollableList = {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
};

type BudgetsRoute = RouteProp<MainTabParamList, "Budgets">;
type BudgetsNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Budgets">,
  NativeStackNavigationProp<MainStackParamList>
>;

const NO_ITEMS: RecurringItem[] = [];

/**
 * Recurring section of the Budgets tab: the two lists, this month's paid / upcoming occurrences, opening
 * the add / edit page, and scrolling to the section when Home sent the user here (`recurringKind` route param).
 */
export function useBudgetRecurringModel(
  listRef: RefObject<ScrollableList | null>,
  month: { year: number; monthIndex0: number },
) {
  const route = useRoute<BudgetsRoute>();
  const navigation = useNavigation<BudgetsNavigation>();
  const today = useCurrentDay();
  const incomeQuery = useRecurringQuery("income");
  const subscriptionQuery = useRecurringQuery("subscription");
  const monthQuery = useRecurringMonthQuery(month.year, month.monthIndex0);

  const income = useMemo<RecurringKindData>(
    () => ({
      items: incomeQuery.data?.items ?? NO_ITEMS,
      monthlyTotal: incomeQuery.data?.summary.monthly_income_total,
      isLoading: incomeQuery.isPending,
      isError: incomeQuery.isError && incomeQuery.data === undefined,
      onRetry: () => void incomeQuery.refetch(),
    }),
    [incomeQuery],
  );
  const subscriptions = useMemo<RecurringKindData>(
    () => ({
      items: subscriptionQuery.data?.items ?? NO_ITEMS,
      monthlyTotal: subscriptionQuery.data?.summary.monthly_subscriptions_total,
      isLoading: subscriptionQuery.isPending,
      isError:
        subscriptionQuery.isError && subscriptionQuery.data === undefined,
      onRetry: () => void subscriptionQuery.refetch(),
    }),
    [subscriptionQuery],
  );

  const onAdd = useCallback(
    (kind: RecurringKind) => navigation.navigate("RecurringEditor", { kind }),
    [navigation],
  );
  const onItemPress = useCallback(
    (item: RecurringItem) =>
      navigation.navigate("RecurringEditor", { kind: item.kind, item }),
    [navigation],
  );

  // A row of "Recurring this month" opens the item it belongs to (the lists above carry the full item).
  const onOccurrencePress = useCallback(
    (occurrence: RecurringOccurrence) => {
      const item = [
        ...(incomeQuery.data?.items ?? NO_ITEMS),
        ...(subscriptionQuery.data?.items ?? NO_ITEMS),
      ].find((candidate) => candidate.id === occurrence.id);
      if (item) {
        navigation.navigate("RecurringEditor", { kind: item.kind, item });
      }
    },
    [incomeQuery.data?.items, navigation, subscriptionQuery.data?.items],
  );

  // Scroll to the section when asked to, then clear the param so the next visit scrolls again.
  const [sectionY, setSectionY] = useState<number | null>(null);
  const onSectionLayout = useCallback((event: LayoutChangeEvent) => {
    setSectionY(event.nativeEvent.layout.y);
  }, []);
  const requestedKind = route.params?.recurringKind;
  useEffect(() => {
    if (!requestedKind || sectionY === null) {
      return;
    }
    listRef.current?.scrollToOffset({ offset: sectionY, animated: true });
    navigation.setParams({ recurringKind: undefined } as never);
  }, [listRef, navigation, requestedKind, sectionY]);

  return {
    today,
    income,
    subscriptions,
    monthData: monthQuery.data,
    monthLoading: monthQuery.isPending,
    monthError: monthQuery.isError,
    onMonthRetry: () => void monthQuery.refetch(),
    onOccurrencePress,
    onAdd,
    onItemPress,
    onSectionLayout,
  };
}
