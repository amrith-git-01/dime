import { useQuery } from "@tanstack/react-query";

import { fetchAgentThreads } from "@/features/agent/api/agentApi";
import { agentQueryKeys } from "@/features/agent/queryKeys";
import { useSessionUserId } from "@/hooks/useSessionUserId";

export function useAgentThreadsQuery(options?: { enabled?: boolean }) {
  const { userId, authReady } = useSessionUserId();

  return useQuery({
    queryKey: agentQueryKeys.threads(userId),
    queryFn: fetchAgentThreads,
    enabled: (options?.enabled ?? true) && authReady && Boolean(userId),
  });
}
