import { useQuery } from "@tanstack/react-query";

import { fetchAgentMessages } from "@/features/agent/api/agentApi";
import { agentQueryKeys } from "@/features/agent/queryKeys";
import { useSessionUserId } from "@/hooks/useSessionUserId";

export function useAgentMessagesQuery(
  threadId: string | null,
  options?: { enabled?: boolean },
) {
  const { userId, authReady } = useSessionUserId();

  return useQuery({
    queryKey: agentQueryKeys.messages(userId, threadId),
    queryFn: () => fetchAgentMessages(threadId!),
    enabled:
      (options?.enabled ?? true) &&
      authReady &&
      Boolean(userId) &&
      Boolean(threadId),
  });
}
