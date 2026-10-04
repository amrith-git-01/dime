import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { TRANSACTIONS_QUERY_STALE_MS } from "@/lib/queryDefaults";

import { fetchTransactions } from "../api/transactionsApi";
import { transactionsQueryKeys } from "../queryKeys";

/** Latest transactions (first page, up to 100). Prefer overview hooks for home/month UX. */
export function useTransactionsQuery() {
  const { userId, authReady } = useSessionUserId();

  return useQuery({
    queryKey: transactionsQueryKeys.list(userId),
    queryFn: () => fetchTransactions(),
    enabled: authReady && Boolean(userId),
    staleTime: TRANSACTIONS_QUERY_STALE_MS,
  });
}
