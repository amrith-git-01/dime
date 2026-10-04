import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { invalidateTransactionDerivedQueries } from "@/features/transactions/cache/invalidateTransactionQueries";
import {
  applyRealtimeTransactionChange,
  realtimePayloadTransactionId,
} from "@/features/transactions/cache/transactionRealtimeCache";
import {
  OWN_CREATE_MARKER,
  recentTransactionMutations,
} from "@/features/transactions/utils/recentMutationTracker";
import { createTrailingDebounce } from "@/features/transactions/utils/trailingDebounce";
import { supabase } from "@/lib/supabase/client";
import { createResubscribeHandler } from "@/lib/supabase/realtimeResubscribe";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

/** Coalesce refetches (spent totals, month summary) after a burst of realtime changes. */
const INVALIDATE_DEBOUNCE_MS = 300;

type TransactionDbRecord = Record<string, unknown>;

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

    const onChange = (
      payload: RealtimePostgresChangesPayload<TransactionDbRecord>,
    ) => {
      const transactionId = realtimePayloadTransactionId(payload);
      // Echo of this device's own recent create/edit/delete; its mutation already refreshed the caches.
      if (
        (transactionId && recentTransactionMutations.isRecent(transactionId)) ||
        (payload.eventType === "INSERT" &&
          recentTransactionMutations.isRecent(OWN_CREATE_MARKER))
      ) {
        return;
      }
      applyRealtimeTransactionChange(queryClient, {
        userId,
        timezone,
        payload,
      });
      scheduleInvalidate.schedule();
    };

    const channel = supabase
      .channel(`transactions:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        onChange,
      )
      .subscribe(
        createResubscribeHandler(() =>
          // Changes made while the socket was down were never delivered.
          invalidateTransactionDerivedQueries(queryClient),
        ),
      );

    return () => {
      scheduleInvalidate.cancel();
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);
}
