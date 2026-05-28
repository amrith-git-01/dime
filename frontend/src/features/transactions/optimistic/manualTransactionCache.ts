import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { format, isSameMonth, parseISO } from "date-fns";
import { randomUUID } from "expo-crypto";

import type { CreateTransactionBody } from "@/features/transactions/api/transactionsApi";
import {
  applyTransactionInsertToListCaches,
  transactionInCalendarMonth,
} from "@/features/transactions/cache/transactionListCache";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type {
  HomeOverview,
  TransactionRow,
} from "@/features/transactions/types";

const OPTIMISTIC_ID_PREFIX = "optimistic-manual-";

export type ManualTransactionOptimisticMeta = {
  categoryName: string | null;
  categoryIconName: string | null;
  categoryColor: string | null;
};

export type OptimisticManualTransactionContext = {
  snapshots: Array<{ queryKey: QueryKey; data: unknown }>;
};

export function isOptimisticTransactionId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

export function buildOptimisticTransactionRow(
  userId: string,
  payload: CreateTransactionBody,
  meta: ManualTransactionOptimisticMeta,
): TransactionRow {
  const nowIso = new Date().toISOString();
  const counterpartyName = payload.counterparty_name.trim();
  return {
    id: `${OPTIMISTIC_ID_PREFIX}${randomUUID()}`,
    user_id: userId,
    amount: payload.amount.toFixed(2),
    type: payload.type,
    counterparty_name: counterpartyName,
    counterparty_type: payload.counterparty_type,
    counterparty_normalized: null,
    merchant: counterpartyName,
    category: meta.categoryName ?? payload.category,
    category_id: payload.category_id ?? null,
    category_icon_name: meta.categoryIconName,
    category_color: meta.categoryColor,
    note: payload.note,
    detected_via: payload.detected_via ?? "manual",
    transaction_at: payload.transaction_at,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    receipt_url: null,
    voice_url: null,
  };
}

function addDebitToTotalString(current: string, amount: number): string {
  const parsed = Number.parseFloat(current);
  const base = Number.isFinite(parsed) ? parsed : 0;
  return (base + amount).toFixed(2);
}

function patchHomeOverviewSpentTotals(
  prev: HomeOverview,
  row: TransactionRow,
): HomeOverview {
  if (row.type !== "debit") {
    return prev;
  }

  const amount = Math.abs(Number.parseFloat(row.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return prev;
  }

  const txDate = parseISO(row.transaction_at);
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const txDayKey = format(txDate, "yyyy-MM-dd");

  let spent_today = prev.spent_today;
  let spent_this_month = prev.spent_this_month;
  if (txDayKey === todayKey) {
    spent_today = addDebitToTotalString(spent_today, amount);
  }
  if (isSameMonth(txDate, new Date())) {
    spent_this_month = addDebitToTotalString(spent_this_month, amount);
  }

  return { ...prev, spent_today, spent_this_month };
}

export function applyOptimisticManualTransaction(
  queryClient: QueryClient,
  input: {
    userId: string;
    timezone: string;
    row: TransactionRow;
  },
): OptimisticManualTransactionContext {
  const { userId, timezone, row } = input;
  const snapshots: OptimisticManualTransactionContext["snapshots"] = [];

  const homeKey = transactionsQueryKeys.home(userId, timezone);
  const prevHome = queryClient.getQueryData<HomeOverview>(homeKey);
  snapshots.push({ queryKey: homeKey, data: prevHome });

  const monthQueries = queryClient.getQueryCache().findAll({
    queryKey: transactionsQueryKeys.all,
    predicate: (query) => {
      const key = query.queryKey;
      return (
        key.length >= 6 &&
        key[0] === transactionsQueryKeys.all[0] &&
        key[1] === "monthPages" &&
        key[2] === userId
      );
    },
  });

  for (const query of monthQueries) {
    const year = query.queryKey[3];
    const calendarMonth = query.queryKey[4];
    if (typeof year !== "number" || typeof calendarMonth !== "number") {
      continue;
    }
    if (!transactionInCalendarMonth(row, year, calendarMonth)) {
      continue;
    }
    snapshots.push({
      queryKey: query.queryKey,
      data: query.state.data,
    });
  }

  applyTransactionInsertToListCaches(queryClient, { userId, timezone, row });

  if (prevHome) {
    const withLists = queryClient.getQueryData<HomeOverview>(homeKey);
    if (withLists) {
      queryClient.setQueryData(
        homeKey,
        patchHomeOverviewSpentTotals(withLists, row),
      );
    }
  }

  return { snapshots };
}

export function rollbackOptimisticManualTransaction(
  queryClient: QueryClient,
  context: OptimisticManualTransactionContext | undefined,
): void {
  if (!context) {
    return;
  }
  for (const { queryKey, data } of context.snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
}
