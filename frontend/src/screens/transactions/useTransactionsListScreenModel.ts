import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format } from "date-fns";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { useCategories } from "@/features/categories/hooks/useCategories";
import { isTourSampleId } from "@/features/tourPreview";

import {
  useTransactionsHistoryInfiniteQuery,
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
import {
  clampMonth,
  earliestSelectableMonth,
  monthLabel as formatMonthLabel,
} from "@/features/transactions/utils/categoryMonthStats";
import { filterTransactionsByCategory } from "@/features/transactions/utils/filterTransactionsByCategory";
import {
  stepMonthWithinBounds,
  type MonthRef,
} from "@/features/transactions/utils/monthListFilter";
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

type RecurringListParams = Extract<
  MainStackParamList["TransactionsList"],
  { filter: "recurring" }
>;

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
  // A recurring item's list is its whole history: no month, no range, filtered by the server.
  const isRecurring = params.filter === "recurring";
  const recurringParams: RecurringListParams | null =
    params.filter === "recurring" ? params : null;
  const now = new Date();
  const routeYear = "year" in params ? params.year : now.getFullYear();
  const routeMonthIndex0 = "monthIndex0" in params ? params.monthIndex0 : now.getMonth();

  const usesRange = listParamsUseRange(params);

  // A category's list has a month navigator and summary card (unless the link carries its own
  // date range, as an agent deep link can): the month is screen state, seeded from the route and
  // re-seeded when the route's month changes, and it drives both the card and the list below.
  const hasMonthCard = params.filter === "category" && !usesRange;
  const routeMonthKey = `${routeYear}-${routeMonthIndex0}`;
  const nowYear = now.getFullYear();
  const nowMonthIndex0 = now.getMonth();
  const currentMonth = useMemo(
    (): MonthRef => ({ year: nowYear, monthIndex0: nowMonthIndex0 }),
    [nowMonthIndex0, nowYear],
  );
  const earliestMonth = useMemo(
    () => earliestSelectableMonth({ year: routeYear, monthIndex0: routeMonthIndex0 }, currentMonth),
    [currentMonth, routeMonthIndex0, routeYear],
  );
  // A route month in the future (a stale link) would strand the navigator: start on the current month.
  const seedMonth = useMemo(
    () => clampMonth({ year: routeYear, monthIndex0: routeMonthIndex0 }, earliestMonth, currentMonth),
    [currentMonth, earliestMonth, routeMonthIndex0, routeYear],
  );
  const [monthChoice, setMonthChoice] = useState<MonthRef & { seedKey: string }>({
    seedKey: routeMonthKey,
    ...seedMonth,
  });
  const selectedMonth: MonthRef = useMemo(() => {
    if (!hasMonthCard) {
      return { year: routeYear, monthIndex0: routeMonthIndex0 };
    }
    return monthChoice.seedKey === routeMonthKey
      ? { year: monthChoice.year, monthIndex0: monthChoice.monthIndex0 }
      : seedMonth;
  }, [hasMonthCard, monthChoice, routeMonthIndex0, routeMonthKey, routeYear, seedMonth]);
  const listYear = selectedMonth.year;
  const listMonthIndex0 = selectedMonth.monthIndex0;

  const prevMonth = stepMonthWithinBounds(selectedMonth, -1, earliestMonth, currentMonth);
  const nextMonth = stepMonthWithinBounds(selectedMonth, 1, earliestMonth, currentMonth);
  const selectMonth = useCallback(
    (month: MonthRef | null) => {
      if (month) {
        setMonthChoice({ ...month, seedKey: routeMonthKey });
      }
    },
    [routeMonthKey],
  );
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
    if (params.filter === "recurring") {
      return { recurringItemId: params.recurringItemId };
    }
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
    listYear,
    listMonthIndex0,
    { enabled: !usesServerRange && !isRecurring, filters: serverFilters },
  );

  const historyQuery = useTransactionsHistoryInfiniteQuery(
    { recurringItemId: recurringParams?.recurringItemId },
    { enabled: isRecurring },
  );

  const rangeFromIso = usesRange ? params.fromIso : (dayRange?.from ?? "");
  const rangeToIso = usesRange ? params.toIso : (dayRange?.to ?? "");

  const rangeQuery = useTransactionsRangeInfiniteQuery(
    rangeFromIso,
    rangeToIso,
    { enabled: usesServerRange, filters: serverFilters },
  );

  const activeQuery = isRecurring
    ? historyQuery
    : usesServerRange
      ? rangeQuery
      : monthQuery;

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
    if (params.filter === "recurring") {
      // The server already returns exactly this item's rows, newest first.
      return flatRows;
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

  // Bumped on every refresh so the category card refetches its own queries along with the list.
  const [cardRefreshToken, setCardRefreshToken] = useState(0);

  /** Inline retry for a failed page or refresh while rows are still on screen. */
  const retry = useCallback(() => {
    if (isFetchNextPageError) {
      void fetchNextPage();
    } else {
      void refetch();
      setCardRefreshToken((token) => token + 1);
    }
  }, [fetchNextPage, isFetchNextPageError, refetch]);

  // While more pages remain the loaded count is a lower bound.
  const transactionCountLabel = `${transactionCount}${hasMore ? "+" : ""}`;
  const transactionCountIsPlural = transactionCount !== 1 || hasMore;

  // The category's current name (it may be renamed in the editor and come back here).
  const { categories: spendCategories } = useCategories("spend");
  const categoryId = params.filter === "category" ? params.categoryId : "";
  const liveCategory = useMemo(
    () =>
      categoryId ? spendCategories.find((category) => category.id === categoryId) : undefined,
    [categoryId, spendCategories],
  );
  const categoryName =
    liveCategory?.name ?? (params.filter === "category" ? params.categoryDisplayName : "");
  // Only a spend category the user owns has an editor (not "uncategorized", a recurring one or the tour's sample).
  const canEditCategory = Boolean(liveCategory) && !isTourSampleId(categoryId);

  const screenTitle = useMemo(() => {
    if (params.filter === "category" && categoryName) {
      return categoryName;
    }
    if (params.filter === "payee" && params.payeeDisplayName) {
      return params.payeeDisplayName;
    }
    if (params.filter === "recurring") {
      return params.recurringDisplayName;
    }
    const label = transactionCountIsPlural ? "Transactions" : "Transaction";
    return `${transactionCountLabel} ${label}`;
  }, [transactionCountLabel, transactionCountIsPlural, params, categoryName]);

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

  const openEditCategory = useCallback(() => {
    navigation.navigate("EditCategory", { categoryId });
  }, [categoryId, navigation]);

  const monthLabel = useMemo(
    () => (isRecurring ? "" : format(new Date(listYear, listMonthIndex0, 1), "MMMM yyyy")),
    [isRecurring, listYear, listMonthIndex0],
  );
  // "12 transactions · October 2026"; a recurring item's list has no month ("12 transactions").
  const subtitle = `${transactionCountLabel} transaction${transactionCountIsPlural ? "s" : ""}${monthLabel ? ` · ${monthLabel}` : ""}`;

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

  const rowsStatus: "loading" | "error" | "ready" = showInitialLoading
    ? "loading"
    : isError && !hasLoadedRows
      ? "error"
      : "ready";

  return {
    listItems,
    filter: params.filter,
    /** What the category month card needs; null for every other list (and a custom date range). */
    categoryCard: hasMonthCard
      ? {
          categoryId,
          categoryName,
          month: selectedMonth,
          monthKey: `${listYear}-${listMonthIndex0}`,
          monthLabel: formatMonthLabel(selectedMonth),
          prevMonthLabel: prevMonth ? formatMonthLabel(prevMonth) : undefined,
          nextMonthLabel: nextMonth ? formatMonthLabel(nextMonth) : undefined,
          canGoPrevMonth: prevMonth !== null,
          canGoNextMonth: nextMonth !== null,
          onPrevMonth: () => selectMonth(prevMonth),
          onNextMonth: () => selectMonth(nextMonth),
          rows: filteredRows,
          rowsHaveMore: hasMore,
          rowsStatus,
          refreshToken: cardRefreshToken,
          canEdit: canEditCategory,
          onEdit: openEditCategory,
        }
      : null,
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
    subtitle,
    recurringName: recurringParams?.recurringDisplayName ?? "",
  };
}
