import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format } from "date-fns";
import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";

import {
  useTransactionsMonthInfiniteQuery,
  useTransactionsRangeInfiniteQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type { TransactionListFilters } from "@/features/transactions/api/transactionsApi";
import type { TransactionRow } from "@/features/transactions/types";
import { UNCATEGORIZED_CATEGORY_KEY } from "@/features/transactions/constants/uncategorizedCategoryKey";
import {
  buildTransactionListSections,
  flattenTransactionListSections,
} from "@/features/transactions/utils/buildTransactionFlashListData";
import { filterTransactionsByCategory } from "@/features/transactions/utils/filterTransactionsByCategory";
import {
  filterTransactionsByPayee,
  resolvePayeeFilterId,
} from "@/features/transactions/utils/payeeKey";
import { signedAmountPaise } from "@/features/transactions/utils/transactionDisplay";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";
import { dayRangeIso } from "@/utils/dates";
import { paiseToRupees } from "@/utils/paise";

type TransactionsListRoute = RouteProp<MainStackParamList, "TransactionsList">;

/** Keep fetching until at least this many rows survive client-side narrowing. */
const MIN_LOADED_ROWS = 20;

/** Payee keys that cannot be expressed as a server-side "contains" filter. */
const CLIENT_ONLY_PAYEE_KEYS = new Set(["__other__", "unknown"]);

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
  // A day is fetched server-side as a half-open [from, to) range so it is never cut off by paging.
  const dayRange = useMemo(
    () => (params.filter === "day" ? dayRangeIso(params.dayKey) : null),
    [params],
  );
  const usesServerRange = usesRange || dayRange !== null;

  // Payee/category narrowing happens on the server (C3) whenever it can be expressed as a
  // filter; the exact match is still re-applied client-side below. "Other"/unknown payees and
  // uncategorized rows have no server equivalent, so those lists page through everything.
  const serverFilters = useMemo((): TransactionListFilters | undefined => {
    if (params.filter === "payee") {
      const payeeId = resolvePayeeFilterId(params);
      return payeeId && !CLIENT_ONLY_PAYEE_KEYS.has(payeeId)
        ? { payee: payeeId }
        : undefined;
    }
    if (params.filter === "category") {
      return params.categoryId &&
        params.categoryId !== UNCATEGORIZED_CATEGORY_KEY
        ? { categoryId: params.categoryId }
        : undefined;
    }
    return undefined;
  }, [params]);
  const needsClientSidePaging =
    params.filter !== "day" && serverFilters === undefined;

  const monthQuery = useTransactionsMonthInfiniteQuery(
    params.year,
    params.monthIndex0,
    { enabled: !usesServerRange, filters: serverFilters },
  );

  const rangeFromIso = usesRange ? params.fromIso : (dayRange?.from ?? "");
  const rangeToIso = usesRange ? params.toIso : (dayRange?.to ?? "");

  const rangeQuery = useTransactionsRangeInfiniteQuery(
    rangeFromIso,
    rangeToIso,
    { enabled: usesServerRange, filters: serverFilters },
  );

  const activeQuery = usesServerRange ? rangeQuery : monthQuery;

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    isError,
    isFetchNextPageError,
    isRefetching,
    refetch,
  } = activeQuery;

  const flatRows = useMemo(() => {
    const pages = infiniteData?.pages ?? [];
    return pages.flatMap((p) => p.items);
  }, [infiniteData]);

  const filteredRows = useMemo((): TransactionRow[] => {
    if (params.filter === "day") {
      return [...flatRows].sort(
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
      params.direction,
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

  const hasMore = Boolean(hasNextPage);

  // Server-filtered lists load on scroll (`loadMore`); this only tops up a list that is too
  // short to scroll, and drains every page when the filter has to run on the client.
  const shouldAutoLoadPages =
    hasMore &&
    !isFetchingNextPage &&
    !isError &&
    (needsClientSidePaging || transactionCount < MIN_LOADED_ROWS);

  useEffect(() => {
    if (!shouldAutoLoadPages) {
      return;
    }
    void fetchNextPage();
  }, [fetchNextPage, shouldAutoLoadPages, flatRows.length]);

  const loadMore = useCallback(() => {
    if (hasMore && !isFetchingNextPage && !isError) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasMore, isError, isFetchingNextPage]);

  /** Inline retry for a failed page or refresh while rows are still on screen. */
  const retry = useCallback(() => {
    if (isFetchNextPageError) {
      void fetchNextPage();
    } else {
      void refetch();
    }
  }, [fetchNextPage, isFetchNextPageError, refetch]);

  // While more pages remain the loaded count is a lower bound.
  const transactionCountLabel = `${transactionCount}${hasMore ? "+" : ""}`;
  const transactionCountIsPlural = transactionCount !== 1 || hasMore;

  const screenTitle = useMemo(() => {
    if (params.filter === "category" && params.categoryDisplayName) {
      return params.categoryDisplayName;
    }
    if (params.filter === "payee" && params.payeeDisplayName) {
      return params.payeeDisplayName;
    }
    const label = transactionCountIsPlural ? "Transactions" : "Transaction";
    return `${transactionCountLabel} ${label}`;
  }, [transactionCountLabel, transactionCountIsPlural, params]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: screenTitle });
  }, [navigation, screenTitle]);

  const openTransactionDetail = useCallback(
    (transaction: TransactionRow) => {
      void triggerHaptic();
      navigation.navigate("TransactionDetail", { transaction });
    },
    [navigation],
  );

  const openManualAddForDay = useCallback(
    (dayKey: string) => {
      navigation.push("ManualAddTransaction", { presetDate: dayKey });
    },
    [navigation],
  );

  const monthLabel = useMemo(() => {
    return format(new Date(params.year, params.monthIndex0, 1), "MMM yyyy");
  }, [params.year, params.monthIndex0]);

  const sectionNetTotals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const section of listSections) {
      const totalPaise = section.data.reduce(
        (sum, tx) => sum + signedAmountPaise(tx),
        0,
      );
      result[section.key] = paiseToRupees(totalPaise);
    }
    return result;
  }, [listSections]);

  const showInitialLoading = isPending && flatRows.length === 0;
  const showLoadingMore = Boolean(hasNextPage) && isFetchingNextPage;
  const hasLoadedRows = flatRows.length > 0;
  const isEmpty =
    !isPending && !isError && transactionCount === 0 && !showLoadingMore;

  const listItems = useMemo(
    () => flattenTransactionListSections(listSections, sectionNetTotals),
    [listSections, sectionNetTotals],
  );

  return {
    listItems,
    filter: params.filter,
    direction: params.filter === "payee" ? (params.direction ?? "debit") : "debit",
    usesRange,
    isEmpty,
    isError,
    hasLoadedRows,
    isRetrying: isFetchingNextPage || isRefetching,
    retry,
    openTransactionDetail,
    openManualAddForDay,
    showInitialLoading,
    showLoadingMore,
    loadMore,
    transactionCount,
    transactionCountLabel,
    transactionCountIsPlural,
    monthLabel,
  };
}
