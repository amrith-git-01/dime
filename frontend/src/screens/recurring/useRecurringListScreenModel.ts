import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";

import { useRecurringQuery } from "@/features/recurring/hooks/useRecurringQuery";
import type { RecurringItem } from "@/features/recurring/types";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import type { MainStackParamList } from "@/navigation/types";

type ListRoute = RouteProp<MainStackParamList, "RecurringList">;

function describeCounts(items: RecurringItem[]): string {
  if (items.length === 0) {
    return "Nothing set up yet.";
  }
  const paused = items.filter((item) => !item.active).length;
  const active = items.length - paused;
  return paused > 0
    ? `${active} active · ${paused} paused`
    : `${active} active`;
}

export function useRecurringListScreenModel() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { kind } = useRoute<ListRoute>().params;
  const today = useCurrentDay();
  const query = useRecurringQuery(kind);

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const summary = query.data?.summary;
  const monthlyTotal =
    kind === "income"
      ? summary?.monthly_income_total
      : summary?.monthly_subscriptions_total;

  const onItemPress = useCallback(
    (item: RecurringItem) => {
      navigation.navigate("EditRecurring", { kind, recurringId: item.id });
    },
    [kind, navigation],
  );
  const onAdd = useCallback(() => {
    navigation.navigate("EditRecurring", { kind });
  }, [kind, navigation]);

  return {
    kind,
    items,
    monthlyTotal,
    summaryDetail: describeCounts(items),
    isLoading: query.isPending,
    isError: query.isError && query.data === undefined,
    today,
    onItemPress,
    onAdd,
  };
}
