import { useQuery } from "@tanstack/react-query";

import { usePreviewable } from "@/features/tourPreview";
import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchRecurring } from "../api/recurringApi";
import { recurringQueryKeys } from "../queryKeys";
import type { RecurringKind } from "../types";

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
  return usePreviewable(query, (sample) =>
    kind === "income" ? sample.recurringIncome : sample.recurringSubscriptions,
  );
}
