import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSessionUserId } from "@/hooks/useSessionUserId";

import { searchBrands } from "../api/payeesApi";
import { payeesQueryKeys } from "../queryKeys";

const DEBOUNCE_MS = 200;
const BRAND_LIMIT = 8;
const STALE_MS = 5 * 60_000;

/**
 * Catalogue brands matching what the user is typing (debounced). The previous results stay on screen while the
 * next query loads, so the list does not flash between keystrokes.
 */
export function useBrandSearch(query: string) {
  const { userId } = useSessionUserId();
  const q = useDebouncedValue(query.trim(), DEBOUNCE_MS);

  return useQuery({
    queryKey: payeesQueryKeys.brandSearch(userId, q.toLowerCase()),
    queryFn: () => searchBrands(q, BRAND_LIMIT),
    enabled: Boolean(userId) && q.length >= 1,
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}
