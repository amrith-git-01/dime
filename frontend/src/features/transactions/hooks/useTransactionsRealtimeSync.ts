import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { invalidateTransactionDerivedQueries } from "@/features/transactions/cache/invalidateTransactionQueries";
import {
  applyRealtimeTransactionChange,
  realtimePayloadTransactionId,
  type RealtimeTransactionPayload,
} from "@/features/transactions/cache/transactionRealtimeCache";
import { recentTransactionMutations } from "@/features/transactions/utils/recentMutationTracker";
import { createTrailingDebounce } from "@/features/transactions/utils/trailingDebounce";
import { realtimeClient } from "@/lib/realtime";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

/** Coalesce refetches (spent totals, month summary) after a burst of realtime changes. */
const INVALIDATE_DEBOUNCE_MS = 300;

export function useTransactionsRealtimeSync(userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) {
      return;
    }

    const timezone = getDeviceIanaTimezone();
    const scheduleInvalidate = createTrailingDebounce(
      () => invalidateTransactionDerivedQueries(queryClient),
      INVALIDATE_DEBOUNCE_MS,
    );

    const onChange = (payload: RealtimeTransactionPayload) => {
      const transactionId = realtimePayloadTransactionId(payload);
      // Echo of this device's own recent edit/delete; its mutation already refreshed the caches.
      // Creates have no known id up front, so their (idempotent) INSERT event is applied normally.
      if (transactionId && recentTransactionMutations.isRecent(transactionId)) {
        return;
      }
      applyRealtimeTransactionChange(queryClient, {
        userId,
        timezone,
        payload,
      });
      scheduleInvalidate.schedule();
    };

    // Changes made while the socket was down were never delivered: onResync refetches.
    const unsubscribe = realtimeClient.subscribe({
      table: "transactions",
      onChange,
      onResync: () => invalidateTransactionDerivedQueries(queryClient),
    });

    return () => {
      scheduleInvalidate.cancel();
      unsubscribe();
    };
  }, [queryClient, userId]);
}
