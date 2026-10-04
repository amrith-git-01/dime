import { useCallback, useEffect, useReducer, useRef } from "react";

import { postAgentFeedback, streamAgentChat } from "@/features/agent/api/agentApi";
import type { AgentFeedbackRating, ChatMessage } from "@/features/agent/types";
import {
  agentChatReducer,
  buildAgentHistory,
  initialAgentChatState,
} from "@/features/agent/utils/agentChatState";
import { getAgentErrorMessage } from "@/features/agent/utils/agentErrorMessage";
import { createDeltaBatcher } from "@/features/agent/utils/createDeltaBatcher";

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useAgentChat() {
  const [state, dispatch] = useReducer(agentChatReducer, initialAgentChatState);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror of `state` so the callbacks stay stable. Written in an effect, never in render.
  const stateRef = useRef(state);
  const isPendingRef = useRef(false);
  // Identifies the in-flight request so late events from an older one are ignored.
  const requestIdRef = useRef(0);
  const batcherRef = useRef<ReturnType<typeof createDeltaBatcher> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const cancelInFlight = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    batcherRef.current?.cancel();
    batcherRef.current = null;
    isPendingRef.current = false;
  }, []);

  useEffect(() => cancelInFlight, [cancelInFlight]);

  const resetConversation = useCallback(() => {
    cancelInFlight();
    dispatch({ type: "reset" });
  }, [cancelInFlight]);

  const sendMessage = useCallback(async (rawContent: string) => {
    const content = rawContent.trim();
    if (!content || isPendingRef.current) {
      return;
    }

    const { messages, memory } = stateRef.current;
    const history = buildAgentHistory(messages);

    const userMessage: ChatMessage = {
      id: newLocalId(),
      role: "user",
      content,
      blocks: [],
      deepLink: null,
    };
    const assistantMessage: ChatMessage = {
      id: newLocalId(),
      role: "assistant",
      content: "",
      blocks: [],
      deepLink: null,
      isPending: true,
    };

    const requestId = ++requestIdRef.current;
    isPendingRef.current = true;
    dispatch({ type: "send", requestId, userMessage, assistantMessage });

    const controller = new AbortController();
    abortRef.current = controller;
    const batcher = createDeltaBatcher((text) =>
      dispatch({ type: "delta", requestId, text }),
    );
    batcherRef.current = batcher;

    const finish = () => {
      batcher.cancel();
      if (requestIdRef.current === requestId) {
        isPendingRef.current = false;
        abortRef.current = null;
        batcherRef.current = null;
      }
    };

    await streamAgentChat(
      { content, history, memory, signal: controller.signal },
      {
        onStep: (step) =>
          dispatch({ type: "step", requestId, label: step.label }),
        onDelta: batcher.push,
        onFinal: (response) => {
          finish();
          dispatch({ type: "final", requestId, response });
        },
        onError: ({ code, message }) => {
          finish();
          dispatch({
            type: "error",
            requestId,
            message: getAgentErrorMessage(code, message),
          });
        },
      },
    );

    if (controller.signal.aborted) {
      dispatch({ type: "abort", requestId });
    }
  }, []);

  const submitFeedback = useCallback(
    (messageId: string, rating: AgentFeedbackRating) => {
      const message = stateRef.current.messages.find(
        (msg) => msg.id === messageId,
      );
      if (!message?.turnId || message.feedback) {
        return;
      }
      dispatch({ type: "feedback", messageId, rating });
      postAgentFeedback({ turn_id: message.turnId, rating }).catch(() =>
        dispatch({ type: "feedbackFailed", messageId }),
      );
    },
    [],
  );

  return {
    messages: state.messages,
    isPending: state.activeRequestId !== null,
    sendMessage,
    resetConversation,
    submitFeedback,
  };
}
