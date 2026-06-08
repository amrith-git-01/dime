export const agentQueryKeys = {
  all: ["agent"] as const,
  threads: (userId: string | null | undefined) =>
    [...agentQueryKeys.all, "threads", userId ?? null] as const,
  messages: (userId: string | null | undefined, threadId: string | null) =>
    [...agentQueryKeys.all, "messages", userId ?? null, threadId] as const,
};
