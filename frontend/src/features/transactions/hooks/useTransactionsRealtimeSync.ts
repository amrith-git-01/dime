import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { applyRealtimeTransactionChange } from "@/features/transactions/cache/transactionRealtimeCache";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import { supabase } from "@/lib/supabase/client";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

/** Coalesce summary refetches (spent totals, month summary) after list patches. */
const SUMMARY_INVALIDATE_DEBOUNCE_MS = 450;

type TransactionDbRecord = Record<string, unknown>;

export function useTransactionsRealtimeSync(userId: string | null) {
  const queryClient = useQueryClient();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const timezone = getDeviceIanaTimezone();

    const scheduleSummaryInvalidate = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void queryClient.invalidateQueries({
          queryKey: transactionsQueryKeys.all,
          predicate: (query) => {
            const segment = query.queryKey[1];
            return segment === "home" || segment === "monthSummary";
          },
          refetchType: "active",
        });
      }, SUMMARY_INVALIDATE_DEBOUNCE_MS);
    };

    const onChange = (
      payload: RealtimePostgresChangesPayload<TransactionDbRecord>,
    ) => {
      applyRealtimeTransactionChange(queryClient, {
        userId,
        timezone,
        payload,
      });
      scheduleSummaryInvalidate();
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
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);
}
