import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { TransactionType } from "@/features/transactions/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchPayeeSuggestions } from "../api/payeesApi";
import { payeesQueryKeys } from "../queryKeys";

const DEBOUNCE_MS = 200;
const STALE_MS = 60_000;

/** The user's own payees of one type, best first; narrowed by the (debounced) typed text when there is any. */
export function usePayeeSuggestions(
  type: TransactionType,
  query: string,
  limit: number,
) {
  const { userId } = useSessionUserId();
  const q = useDebouncedValue(query.trim(), DEBOUNCE_MS);

  return useQuery({
    queryKey: payeesQueryKeys.suggestions(userId, type, q.toLowerCase(), limit),
    queryFn: () => fetchPayeeSuggestions(type, q || undefined, limit),
    enabled: Boolean(userId),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}
