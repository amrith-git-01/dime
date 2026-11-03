import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";

import type { RecurringKindData } from "@/features/recurring/components";
import { useRecurringQuery } from "@/features/recurring/hooks/useRecurringQuery";
import type { RecurringItem, RecurringKind } from "@/features/recurring/types";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import { emitTourEvent, tourEventNames } from "@/lib/tour/tourEvents";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";

type BudgetsNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Budgets">,
  NativeStackNavigationProp<MainStackParamList>
>;

const NO_ITEMS: RecurringItem[] = [];

/**
 * Recurring section of the Budgets tab: the two lists, the add / edit page (the pencil on a row)
 * and an item's transaction history (tapping the row).
 */
export function useBudgetRecurringModel() {
  const navigation = useNavigation<BudgetsNavigation>();
  const today = useCurrentDay();
  const incomeQuery = useRecurringQuery("income");
  const subscriptionQuery = useRecurringQuery("subscription");

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
    (item: RecurringItem) => {
      navigation.navigate("TransactionsList", {
        filter: "recurring",
        recurringItemId: item.id,
        recurringDisplayName: item.name,
        kind: item.kind,
      });
    },
    [navigation],
  );
  const onItemEdit = useCallback(
    (item: RecurringItem) => {
      navigation.navigate("RecurringEditor", { kind: item.kind, item });
      emitTourEvent(tourEventNames.recurringOpened);
    },
    [navigation],
  );

  const onAddReminder = useCallback(
    () => navigation.navigate("ReminderEditor", {}),
    [navigation],
  );
  const onSeeReminders = useCallback(
    () => navigation.navigate("Reminders"),
    [navigation],
  );

  return {
    today,
    income,
    subscriptions,
    onAdd,
    onItemPress,
    onItemEdit,
    onAddReminder,
    onSeeReminders,
  };
}
