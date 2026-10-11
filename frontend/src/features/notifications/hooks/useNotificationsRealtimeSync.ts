import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { realtimeClient } from "@/lib/realtime";

import { notificationQueryKeys } from "../queryKeys";

/**
 * The server inserts budget/auto-capture notifications in the background (after the transaction
 * response), so a refetch right after a create can miss them. It broadcasts each new row over the
 * live socket: refresh the bell badge and the inbox the moment it arrives.
 */
export function useNotificationsRealtimeSync(userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) {
      return;
    }

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    };

    // Rows inserted while the socket was down were never delivered: onResync refetches.
    return realtimeClient.subscribe({
      table: "notifications",
      onChange: refresh,
      onResync: refresh,
    });
  }, [queryClient, userId]);
}
