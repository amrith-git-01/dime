import { useQueryClient } from "@tanstack/react-query";
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
import { invalidateOnboardingProgress } from "@/features/onboarding/cache/invalidateOnboardingProgress";
import { invalidateLimitsQueries } from "@/features/limits/cache/invalidateLimitsQueries";
import { useAgentChatUiStore } from "@/stores/agentChatUiStore";

const ONE_DAY_S = 24 * 60 * 60;

/** Seconds until the next UTC midnight, when the server resets the daily allowance. */
function secondsToUtcMidnight(now: number): number {
  return Math.max(1, ONE_DAY_S - Math.floor((now / 1000) % ONE_DAY_S));
}

function selectDailyLimitReached(s: { limitedUntil: number | null }): boolean {
  return s.limitedUntil !== null && s.limitedUntil > Date.now();
}

/** True while today's agent allowance is used up (input should stay disabled). */
export function useAgentDailyLimitReached(): boolean {
  return useAgentChatUiStore(selectDailyLimitReached);
}

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useAgentChat() {
  const [state, dispatch] = useReducer(agentChatReducer, initialAgentChatState);
  const queryClient = useQueryClient();
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
          invalidateLimitsQueries(queryClient);
          // The server stamps "asked Dime AI" when a turn answers.
          invalidateOnboardingProgress(queryClient);
          dispatch({ type: "final", requestId, response });
        },
        onError: ({ code, message, retryAfterSeconds }) => {
          finish();
          invalidateLimitsQueries(queryClient);
          if (code === "daily_limit") {
            const now = Date.now();
            useAgentChatUiStore
              .getState()
              .setLimitedUntil(
                now + (retryAfterSeconds ?? secondsToUtcMidnight(now)) * 1000,
              );
          }
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
  }, [queryClient]);

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
