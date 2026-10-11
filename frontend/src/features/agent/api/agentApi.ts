import { fetch } from "expo/fetch";

import {
  dimeApi,
  getDimeApiBaseUrl,
  getDimeAuthHeaders,
  refreshDimeAuthHeaders,
} from "@/lib/api/dimeApi";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import type {
  AgentChatErrorBody,
  AgentChatHistoryMessage,
  AgentChatResponse,
  AgentFeedbackRating,
  AgentStepEvent,
} from "../types";
import {
  decodeAgentStreamEvent,
  type AgentStreamEvent,
} from "../utils/agentStreamEvents";
import { createSseParser } from "../utils/sseParser";

const CHAT_PATH = "/api/v1/agent/chat";
const FEEDBACK_PATH = "/api/v1/agent/feedback";
/** Hard ceiling for one turn (server deadline is 25 s). */
const STREAM_TIMEOUT_MS = 60_000;

export type AgentChatRequest = {
  content: string;
  history?: AgentChatHistoryMessage[];
  /** Signed memory token from the previous `final`, echoed unchanged. */
  memory?: string | null;
  timezone?: string;
  signal?: AbortSignal;
};

export type AgentStreamHandlers = {
  onStep?: (step: AgentStepEvent) => void;
  onDelta?: (text: string) => void;
  /** Terminal success. Exactly one of `onFinal` / `onError` fires per call (neither when aborted). */
  onFinal: (response: AgentChatResponse) => void;
  /** Terminal failure: an `error` event, a C5 JSON body, HTTP failure or a broken stream. */
  onError: (error: {
    code: string;
    message: string;
    /** Seconds until a limit resets (from `Retry-After`), when the server said. */
    retryAfterSeconds?: number;
  }) => void;
};

function isErrorBody(value: unknown): value is AgentChatErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as AgentChatErrorBody).error === "object" &&
    (value as AgentChatErrorBody).error !== null
  );
}

async function postChat(
  body: string,
  authHeaders: Record<string, string>,
  signal: AbortSignal,
) {
  return fetch(`${getDimeApiBaseUrl()}${CHAT_PATH}`, {
    method: "POST",
    headers: {
      ...authHeaders,
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body,
    signal,
  });
}

/** Reads a non-streaming (JSON) answer: a `ChatResponse` or a C5 error body. */
async function handleJsonResponse(
  response: Awaited<ReturnType<typeof postChat>>,
  handlers: AgentStreamHandlers,
): Promise<void> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON body */
  }
  const retryAfter = Number(response.headers.get("retry-after"));
  const retryAfterSeconds =
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
  // Today's question allowance is used up: 429 with a human-readable `detail` (or a C5 body).
  const detail =
    typeof data === "object" && data !== null
      ? (data as { detail?: unknown }).detail
      : undefined;
  if (response.status === 429 && typeof detail === "string" && detail.trim()) {
    handlers.onError({
      code: "daily_limit",
      message: detail.trim(),
      retryAfterSeconds,
    });
    return;
  }
  if (isErrorBody(data)) {
    const code =
      typeof data.error.code === "string" ? data.error.code : "unknown";
    handlers.onError({
      code,
      message: typeof data.error.message === "string" ? data.error.message : "",
      ...(code === "daily_limit" ? { retryAfterSeconds } : {}),
    });
    return;
  }
  if (!response.ok || typeof data !== "object" || data === null) {
    handlers.onError({
      code: response.status === 429 ? "rate_limited" : "http_error",
      message: "",
    });
    return;
  }
  const answer = (data as Partial<AgentChatResponse>).answer;
  if (typeof answer !== "string") {
    handlers.onError({ code: "invalid_response", message: "" });
    return;
  }
  const { blocks, deep_link, memory, turn_id } = data as AgentChatResponse;
  handlers.onFinal({
    answer,
    blocks: Array.isArray(blocks) ? blocks : [],
    deep_link: deep_link ?? null,
    memory: memory ?? null,
    turn_id: turn_id ?? null,
  });
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  handlers: AgentStreamHandlers,
): Promise<void> {
  const decoder = new TextDecoder();
  let terminal = false;

  const dispatch = (event: AgentStreamEvent) => {
    if (terminal) {
      return;
    }
    switch (event.type) {
      case "step":
        handlers.onStep?.(event.step);
        break;
      case "delta":
        handlers.onDelta?.(event.text);
        break;
      case "final":
        terminal = true;
        handlers.onFinal(event.response);
        break;
      case "error":
        terminal = true;
        handlers.onError({ code: event.code, message: event.message });
        break;
    }
  };

  const parser = createSseParser((message) => {
    const event = decodeAgentStreamEvent(message);
    if (event) {
      dispatch(event);
    }
  });

  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parser.feed(decoder.decode(value, { stream: true }));
      if (terminal) {
        break;
      }
    }
    parser.feed(decoder.decode());
    parser.end();
  } finally {
    reader.cancel().catch(() => undefined);
  }
  if (!terminal) {
    handlers.onError({ code: "stream_incomplete", message: "" });
  }
}

/**
 * Streams one agent turn over SSE (`Accept: text/event-stream`). Falls back to
 * reading a plain JSON answer from the same response when the server (or the
 * runtime) does not stream. Reports through `handlers`; resolves when the turn
 * ended, and never rejects: failures arrive via `onError`, and a user abort
 * produces no callback at all.
 */
export async function streamAgentChat(
  input: AgentChatRequest,
  handlers: AgentStreamHandlers,
): Promise<void> {
  const controller = new AbortController();
  const userSignal = input.signal;
  const abortFromUser = () => controller.abort();
  if (userSignal?.aborted) {
    return;
  }
  userSignal?.addEventListener("abort", abortFromUser);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, STREAM_TIMEOUT_MS);

  const body = JSON.stringify({
    content: input.content,
    timezone: input.timezone ?? getDeviceIanaTimezone(),
    history: input.history ?? [],
    ...(input.memory ? { memory: input.memory } : {}),
  });

  try {
    const sentHeaders = await getDimeAuthHeaders();
    let response = await postChat(body, sentHeaders, controller.signal);
    if (response.status === 401) {
      const fresh = await refreshDimeAuthHeaders(sentHeaders);
      if (!fresh.Authorization) {
        handlers.onError({ code: "unauthorized", message: "" });
        return;
      }
      response = await postChat(body, fresh, controller.signal);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (response.body && contentType.includes("text/event-stream")) {
      await readEventStream(response.body, handlers);
    } else {
      await handleJsonResponse(response, handlers);
    }
  } catch (error) {
    if (timedOut) {
      handlers.onError({ code: "timeout", message: "" });
    } else if (!userSignal?.aborted) {
      handlers.onError({
        code: "network",
        message: error instanceof Error ? error.message : "",
      });
    }
  } finally {
    clearTimeout(timeout);
    userSignal?.removeEventListener("abort", abortFromUser);
  }
}

type PostAgentFeedbackInput = {
  turn_id: string;
  rating: AgentFeedbackRating;
};

export async function postAgentFeedback(
  input: PostAgentFeedbackInput,
): Promise<void> {
  await dimeApi.post(FEEDBACK_PATH, input);
}
