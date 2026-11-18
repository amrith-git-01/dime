import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useToast } from "@/features/toast/useToast";

import { invalidateTransactionDerivedQueries } from "../cache/invalidateTransactionQueries";
import { STALE_TRANSACTION_MESSAGE } from "../utils/staleError";

/**
 * What every screen does when a save or delete finds the row changed on another device (409 `stale`): refetch
 * everything it could show (the open detail and the lists included) and say so.
 */
export function useStaleTransactionHandler(): () => void {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  return useCallback(() => {
    invalidateTransactionDerivedQueries(queryClient);
    showToast({ variant: "info", message: STALE_TRANSACTION_MESSAGE });
  }, [queryClient, showToast]);
}
