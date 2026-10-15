import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { Platform } from "react-native";

import {
  budgetQueryKeys,
  categoryBudgetsQueryKeys,
} from "@/features/budgets/queryKeys";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import { reportError } from "@/lib/reportError";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";
import { refreshWidgets } from "@/widgets/refreshWidgets";

import { buildWidgetSnapshot } from "./buildWidgetSnapshot";
import { writeWidgetSnapshot } from "./widgetSnapshotMmkv";

/** Trailing wait so a burst of cache updates (a refetch wave) writes the snapshot once. */
const WRITE_DEBOUNCE_MS = 500;

const TRANSACTIONS_ROOT = transactionsQueryKeys.all[0];
const BUDGET_ROOT = budgetQueryKeys.all[0];
const CATEGORY_BUDGETS_ROOT = categoryBudgetsQueryKeys.all[0];

/** Only the queries the snapshot is built from: the home overview and the budgets. */
export function affectsWidgetSnapshot(queryKey: QueryKey): boolean {
  const [root, kind] = queryKey;
  if (root === TRANSACTIONS_ROOT) {
    return kind === "home";
  }
  return root === BUDGET_ROOT || root === CATEGORY_BUDGETS_ROOT;
}

/**
 * Rebuilds the snapshot from the query cache and, when it changed, writes it and redraws the
 * widgets. Never throws: a widget problem must not affect the app.
 */
export function syncWidgetSnapshot(queryClient: QueryClient): void {
  try {
    const userId = useAuthSessionStore.getState().userId;
    if (!userId) {
      return;
    }
    const snapshot = buildWidgetSnapshot({
      queryClient,
      userId,
      timezone: getDeviceIanaTimezone(),
    });
    // No overview cached yet: keep the last good snapshot rather than blanking the widgets.
    if (snapshot && writeWidgetSnapshot(snapshot)) {
      refreshWidgets();
    }
  } catch (error) {
    reportError(error, "widget snapshot sync failed");
  }
}

/**
 * The single writer of the widget snapshot (Android only): follows successful updates of the
 * queries it is built from, debounced. Also syncs once at start so the widgets catch up with the
 * cache restored from disk. Returns an unsubscribe function.
 */
export function subscribeWidgetSnapshotWriter(
  queryClient: QueryClient,
  debounceMs: number = WRITE_DEBOUNCE_MS,
): () => void {
  if (Platform.OS !== "android") {
    return () => undefined;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => syncWidgetSnapshot(queryClient), debounceMs);
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    // `added` with data covers a cache restored from disk, which raises no success update.
    const hasNewData =
      (event.type === "updated" && event.action.type === "success") ||
      (event.type === "added" && event.query.state.data !== undefined);
    if (hasNewData && affectsWidgetSnapshot(event.query.queryKey)) {
      schedule();
    }
  });
  schedule();

  return () => {
    unsubscribe();
    clearTimeout(timer);
  };
}
