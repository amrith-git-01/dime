import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  invalidateTransactionAggregates,
  invalidateTransactionDerivedQueries,
} from "@/features/transactions/cache/invalidateTransactionQueries";
import {
  applyRealtimeTransactionChange,
  realtimePayloadTransactionId,
  type RealtimeTransactionPayload,
} from "@/features/transactions/cache/transactionRealtimeCache";
import { recentTransactionMutations } from "@/features/transactions/utils/recentMutationTracker";
import { createTrailingDebounce } from "@/features/transactions/utils/trailingDebounce";
import { expediteQueuedManualItems } from "@/lib/outbox/outboxQueue";
import { realtimeClient } from "@/lib/realtime";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

/**
 * Coalesce refetches (spent totals, month summary) after a burst of realtime changes. The lists were
 * already patched by `applyRealtimeTransactionChange`, so only the aggregates refetch.
 */
const INVALIDATE_DEBOUNCE_MS = 300;

export function useTransactionsRealtimeSync(userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) {
      return;
    }

    const timezone = getDeviceIanaTimezone();
    const scheduleInvalidate = createTrailingDebounce(
      () => invalidateTransactionAggregates(queryClient),
      INVALIDATE_DEBOUNCE_MS,
    );

    const onChange = (payload: RealtimeTransactionPayload) => {
      const transactionId = realtimePayloadTransactionId(payload);
      // Echo of this device's own write (same `updated_at` as the server answered it); its mutation already
      // refreshed the caches. Another device's change to the same row has a different `updated_at` and is applied.
      if (
        transactionId &&
        recentTransactionMutations.isEcho(transactionId, {
          updatedAt: typeof payload.new.updated_at === "string" ? payload.new.updated_at : null,
          removal: payload.eventType === "DELETE" || Boolean(payload.new.deleted_at),
        })
      ) {
        return;
      }
      applyRealtimeTransactionChange(queryClient, {
        userId,
        timezone,
        payload,
      });
      scheduleInvalidate.schedule();
      // A manual entry saved elsewhere may be the one this device still shows as waiting.
      if (payload.eventType === "INSERT" && payload.new.detected_via === "manual") {
        expediteQueuedManualItems();
      }
    };

    // Changes made while the socket was down were never delivered: onResync refetches everything
    // (cheap: unchanged bodies answer 304).
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
