import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchTransactions } from "../api/transactionsApi";
import { transactionsQueryKeys } from "../queryKeys";

export function useTransactionsQuery() {
  const { userId, authReady } = useSessionUserId();

  return useQuery({
    queryKey: transactionsQueryKeys.list(userId),
    queryFn: () => fetchTransactions(),
    enabled: authReady && Boolean(userId),
  });
}
