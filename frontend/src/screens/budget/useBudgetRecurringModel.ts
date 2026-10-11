import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import type { LayoutChangeEvent } from "react-native";

import type { RecurringKindData } from "@/features/recurring/components";
import { useRecurringQuery } from "@/features/recurring/hooks/useRecurringQuery";
import type { RecurringItem, RecurringKind } from "@/features/recurring/types";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import type { MainTabParamList } from "@/navigation/types";

type ScrollableList = {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
};

type BudgetsRoute = RouteProp<MainTabParamList, "Budgets">;

type SheetState = { kind: RecurringKind; item?: RecurringItem } | null;

const NO_ITEMS: RecurringItem[] = [];

/**
 * Recurring section of the Budgets tab: the two lists, the add / edit sheet, and scrolling to
 * the section when Home or Settings sent the user here (`recurringKind` route param).
 */
export function useBudgetRecurringModel(
  listRef: RefObject<ScrollableList | null>,
) {
  const route = useRoute<BudgetsRoute>();
  const navigation = useNavigation();
  const today = useCurrentDay();
  const incomeQuery = useRecurringQuery("income");
  const subscriptionQuery = useRecurringQuery("subscription");

  const [sheet, setSheet] = useState<SheetState>(null);
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

  const onAdd = useCallback((kind: RecurringKind) => setSheet({ kind }), []);
  const onItemPress = useCallback(
    (item: RecurringItem) => setSheet({ kind: item.kind, item }),
    [],
  );
  const onSheetClose = useCallback(() => setSheet(null), []);

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
    onAdd,
    onItemPress,
    onSectionLayout,
    sheetVisible: sheet !== null,
    sheetKind: sheet?.kind ?? "income",
    sheetItem: sheet?.item,
    onSheetClose,
  };
}
