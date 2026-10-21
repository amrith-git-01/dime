import { useQuery } from "@tanstack/react-query";

import { isRecurringListEmpty, usePreviewable } from "@/features/tourPreview";
import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchRecurring } from "../api/recurringApi";
import { recurringQueryKeys } from "../queryKeys";
import type { RecurringKind, RecurringListResponse } from "../types";

/** Recurring items + monthly totals for one kind. Mutations and screens invalidate it. */
export function useRecurringQuery(
  kind: RecurringKind,
  options?: { enabled?: boolean },
) {
  const { userId } = useSessionUserId();

  const query = useQuery({
    queryKey: recurringQueryKeys.list(userId, kind),
    queryFn: () => fetchRecurring(kind),
    enabled: Boolean(userId) && (options?.enabled ?? true),
  });
  // Income and subscriptions are one picture: the sample only stands in when both lists are empty.
  const otherKind: RecurringKind = kind === "income" ? "subscription" : "income";
  return usePreviewable(query, {
    domain: "recurring",
    isEmpty: isRecurringListEmpty,
    select: (set) => ({
      data:
        kind === "income"
          ? set.current.recurringIncome
          : set.current.recurringSubscriptions,
    }),
    cacheCheck: (queryClient, sessionUserId) => {
      const other = queryClient.getQueryData<RecurringListResponse>(
        recurringQueryKeys.list(sessionUserId, otherKind),
      );
      return other !== undefined && other.items.length === 0;
    },
  });
}
