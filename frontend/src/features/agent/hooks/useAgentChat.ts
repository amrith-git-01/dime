import { useCallback, useEffect, useRef, useState } from "react";

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
    .filter(
      (msg) => !msg.isPending && !msg.isError && msg.content.trim().length > 0,
    )
    .map((msg) => ({
      role: msg.role,
      content: msg.content.trim(),
    }));
}

export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isPending, setIsPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Refs so sendMessage stays stable (no [messages] dep). Written in effects/handlers, never in render.
  const messagesRef = useRef(messages);
  const isPendingRef = useRef(false);
  // Identifies the in-flight request so a stale `finally` cannot clear a newer one.
  const requestIdRef = useRef(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const resetConversation = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    isPendingRef.current = false;
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

      const requestId = ++requestIdRef.current;
      isPendingRef.current = true;
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
              ? { ...msg, content: message, isPending: false, isError: true }
              : msg,
          ),
        );
      } finally {
        if (requestIdRef.current === requestId) {
          isPendingRef.current = false;
          setIsPending(false);
          abortRef.current = null;
        }
      }
    },
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
