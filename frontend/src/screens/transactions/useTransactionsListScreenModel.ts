import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";

import {
  useTransactionsMonthInfiniteQuery,
  useTransactionsRangeInfiniteQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type { TransactionRow } from "@/features/transactions/types";
import {
  buildTransactionListSections,
  filterTransactionsByCalendarDay,
} from "@/features/transactions/utils/buildTransactionFlashListData";
import { filterTransactionsByCategory } from "@/features/transactions/utils/filterTransactionsByCategory";
import {
  filterTransactionsByPayee,
  resolvePayeeFilterId,
} from "@/features/transactions/utils/payeeKey";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";

type TransactionsListRoute = RouteProp<MainStackParamList, "TransactionsList">;

function listParamsUseRange(
  params: MainStackParamList["TransactionsList"],
): params is Extract<
  MainStackParamList["TransactionsList"],
  { filter: "payee" | "category" }
> & { fromIso: string; toIso: string } {
  if (params.filter !== "payee" && params.filter !== "category") {
    return false;
  }
  return (
    typeof params.fromIso === "string" &&
    params.fromIso.length > 0 &&
    typeof params.toIso === "string" &&
    params.toIso.length > 0
  );
}

export function useTransactionsListScreenModel() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { params } = useRoute<TransactionsListRoute>();

  const usesRange = listParamsUseRange(params);

  const monthQuery = useTransactionsMonthInfiniteQuery(
    params.year,
    params.monthIndex0,
    { enabled: !usesRange },
  );

  const rangeFromIso = usesRange ? params.fromIso : "";
  const rangeToIso = usesRange ? params.toIso : "";

  const rangeQuery = useTransactionsRangeInfiniteQuery(
    rangeFromIso,
    rangeToIso,
    { enabled: usesRange },
  );

  const activeQuery = usesRange ? rangeQuery : monthQuery;

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    isError,
  } = activeQuery;

  const flatRows = useMemo(() => {
    const pages = infiniteData?.pages ?? [];
    return pages.flatMap((p) => p.items);
  }, [infiniteData]);

  const filteredRows = useMemo((): TransactionRow[] => {
    if (params.filter === "day") {
      return filterTransactionsByCalendarDay(flatRows, params.dayKey).sort(
        (a, b) =>
          new Date(b.transaction_at).getTime() -
          new Date(a.transaction_at).getTime(),
      );
    }
    if (params.filter === "category") {
      return filterTransactionsByCategory(flatRows, params.categoryId);
    }
    return filterTransactionsByPayee(
      flatRows,
      resolvePayeeFilterId(params),
      params.payeeKeysTop,
    );
  }, [flatRows, params]);

  const listSections = useMemo(
    () =>
      buildTransactionListSections(
        filteredRows,
        params.filter,
        params.filter === "day" ? params.dayKey : undefined,
      ),
    [filteredRows, params],
  );

  const transactionCount = filteredRows.length;

  const shouldLoadMorePages = useMemo(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return false;
    }
    if (params.filter === "payee" || params.filter === "category") {
      return true;
    }
    return filteredRows.length === 0;
  }, [filteredRows.length, hasNextPage, isFetchingNextPage, params.filter]);

  useEffect(() => {
    if (!shouldLoadMorePages) {
      return;
    }
    void fetchNextPage();
  }, [fetchNextPage, shouldLoadMorePages, flatRows.length]);

  const screenTitle = useMemo(() => {
    const label = transactionCount === 1 ? "Transaction" : "Transactions";
    return `${transactionCount} ${label}`;
  }, [transactionCount]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: screenTitle });
  }, [navigation, screenTitle]);

  const openTransactionDetail = useCallback(
    (transaction: TransactionRow) => {
      void triggerLightHaptic();
      navigation.navigate("TransactionDetail", { transaction });
    },
    [navigation],
  );

  const showInitialLoading = isPending && flatRows.length === 0;
  const showLoadingMore =
    Boolean(hasNextPage) &&
    isFetchingNextPage &&
    (params.filter !== "day" || filteredRows.length === 0);
  const isEmpty =
    !isPending && !isError && transactionCount === 0 && !showLoadingMore;

  return {
    listSections,
    filter: params.filter,
    usesRange,
    isEmpty,
    isError,
    openTransactionDetail,
    showInitialLoading,
    showLoadingMore,
    transactionCount,
  };
}
