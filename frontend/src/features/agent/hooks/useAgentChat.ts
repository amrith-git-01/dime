import { useCallback, useRef, useState } from "react";

import { postAgentChat } from "@/features/agent/api/agentApi";
import type {
  AgentBlock,
  AgentChatHistoryMessage,
  AgentDeepLink,
  ChatMessage,
} from "@/features/agent/types";

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toApiHistory(messages: ChatMessage[]): AgentChatHistoryMessage[] {
  return messages
    .filter((msg) => !msg.isPending && msg.content.trim().length > 0)
    .map((msg) => ({
      role: msg.role,
      content: msg.content.trim(),
    }));
}

export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isPending, setIsPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Always-current refs so sendMessage stays stable (no [messages, isPending] dep).
  const messagesRef = useRef(messages);
  const isPendingRef = useRef(isPending);
  messagesRef.current = messages;
  isPendingRef.current = isPending;

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setIsPending(false);
  }, []);

  const sendMessage = useCallback(
    async (rawContent: string) => {
      const content = rawContent.trim();
      if (!content || isPendingRef.current) {
        return;
      }

      const history = toApiHistory(messagesRef.current);

      const userMessage: ChatMessage = {
        id: newLocalId(),
        role: "user",
        content,
        blocks: [],
        deepLink: null,
      };
      const assistantId = newLocalId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        blocks: [],
        deepLink: null,
        isPending: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsPending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await postAgentChat({
          content,
          history,
          signal: controller.signal,
        });

        const blocks = (response.blocks ?? []) as AgentBlock[];
        const deepLink = (response.deep_link as AgentDeepLink | null) ?? null;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: response.answer,
                  blocks,
                  deepLink,
                  isPending: false,
                }
              : msg,
          ),
        );
      } catch (error) {
        if (controller.signal.aborted) {
          setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
          return;
        }
        const message =
          error instanceof Error ? error.message : "Failed to send message";
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: message, isPending: false }
              : msg,
          ),
        );
      } finally {
        setIsPending(false);
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads via refs
    [],
  );

  const cancelRequest = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    isPending,
    sendMessage,
    resetConversation,
    cancelRequest,
  };
}
