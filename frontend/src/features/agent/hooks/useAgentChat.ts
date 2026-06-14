import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createAgentThread,
  streamAgentChat,
} from "@/features/agent/api/agentApi";
import { agentQueryKeys } from "@/features/agent/queryKeys";
import type {
  AgentBlock,
  AgentChatStatus,
  AgentDeepLink,
  ChatStreamMessage,
} from "@/features/agent/types";
import { useSessionUserId } from "@/hooks/useSessionUserId";

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function historyToChatMessages(
  rows: {
    id: string;
    role: string;
    content: string;
    blocks_json: AgentBlock[] | null;
    deep_link_json: AgentDeepLink | null;
  }[],
): ChatStreamMessage[] {
  return rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      id: row.id,
      role: row.role as "user" | "assistant",
      content: row.content,
      blocks: row.blocks_json ?? [],
      deepLink: row.deep_link_json,
    }));
}

export function useAgentChat() {
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatStreamMessage[]>([]);
  const [status, setStatus] = useState<AgentChatStatus>({ phase: "idle" });
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const threadIdRef = useRef<string | null>(null);

  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  const createThreadMutation = useMutation({
    mutationFn: () => createAgentThread(),
    onSuccess: (thread) => {
      setThreadId(thread.id);
      void queryClient.invalidateQueries({
        queryKey: agentQueryKeys.threads(userId),
      });
    },
  });

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setThreadId(null);
    setMessages([]);
    setStatus({ phase: "idle" });
    setIsStreaming(false);
  }, []);

  const ensureThread = useCallback(async (): Promise<string> => {
    if (threadIdRef.current) {
      return threadIdRef.current;
    }
    const thread = await createThreadMutation.mutateAsync();
    setThreadId(thread.id);
    return thread.id;
  }, [createThreadMutation]);

  const sendMessage = useCallback(
    async (rawContent: string) => {
      const content = rawContent.trim();
      if (!content || isStreaming) {
        return;
      }

      const userMessage: ChatStreamMessage = {
        id: newLocalId(),
        role: "user",
        content,
        blocks: [],
        deepLink: null,
      };
      const assistantId = newLocalId();
      const assistantMessage: ChatStreamMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        blocks: [],
        deepLink: null,
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);
      setStatus({ phase: "sql", round: 1 });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const activeThreadId = await ensureThread();
        let answerText = "";
        let blocks: AgentBlock[] = [];
        let deepLink: AgentDeepLink | null = null;

        await streamAgentChat({
          threadId: activeThreadId,
          content,
          signal: controller.signal,
          onEvent: (event) => {
            switch (event.event) {
              case "sql_start":
                setStatus({ phase: "sql", round: event.round });
                break;
              case "sql_end":
                setStatus({ phase: "sql", round: event.round });
                break;
              case "reflect":
                if (event.status === "retry") {
                  setStatus({ phase: "reflect", reason: event.reason });
                }
                break;
              case "token":
                answerText = event.text;
                setStatus({ phase: "responding" });
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: answerText }
                      : msg,
                  ),
                );
                break;
              case "block":
                blocks = [...blocks, event.block];
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId ? { ...msg, blocks } : msg,
                  ),
                );
                break;
              case "deep_link":
                deepLink = {
                  screen: event.screen,
                  params: event.params,
                };
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId ? { ...msg, deepLink } : msg,
                  ),
                );
                break;
              case "error":
                setStatus({ phase: "error", message: event.message });
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId
                      ? {
                          ...msg,
                          content: event.message,
                          isStreaming: false,
                        }
                      : msg,
                  ),
                );
                break;
              case "done":
                setStatus({ phase: "idle" });
                break;
              default:
                break;
            }
          },
        });

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: answerText || msg.content,
                  blocks,
                  deepLink,
                  isStreaming: false,
                }
              : msg,
          ),
        );
        setStatus({ phase: "idle" });

        void queryClient.invalidateQueries({
          queryKey: agentQueryKeys.threads(userId),
        });
        void queryClient.invalidateQueries({
          queryKey: agentQueryKeys.messages(userId, activeThreadId),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send message";
        if (message !== "Chat cancelled") {
          setStatus({ phase: "error", message });
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: message, isStreaming: false }
                : msg,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [ensureThread, isStreaming, queryClient, userId],
  );

  const loadThreadHistory = useCallback(
    (rows: Parameters<typeof historyToChatMessages>[0], id: string) => {
      setThreadId(id);
      setMessages(historyToChatMessages(rows));
      setStatus({ phase: "idle" });
    },
    [],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    threadId,
    messages,
    status,
    isStreaming,
    sendMessage,
    resetConversation,
    loadThreadHistory,
    cancelStream,
    isCreatingThread: createThreadMutation.isPending,
  };
}
