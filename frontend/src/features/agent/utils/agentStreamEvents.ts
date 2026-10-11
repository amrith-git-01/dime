import type { AgentChatResponse, AgentStepEvent } from "../types";

import type { SseMessage } from "./sseParser";

export type AgentStreamEvent =
  | { type: "step"; step: AgentStepEvent }
  | { type: "delta"; text: string }
  | { type: "final"; response: AgentChatResponse }
  | { type: "error"; code: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Decode one SSE message into a typed agent event; unknown or malformed events yield `null`. */
export function decodeAgentStreamEvent(
  message: SseMessage,
): AgentStreamEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(message.data);
  } catch {
    return null;
  }
  if (!isRecord(payload)) {
    return null;
  }
  switch (message.event) {
    case "step":
      return typeof payload.label === "string" && payload.label
        ? {
            type: "step",
            step: {
              tool: typeof payload.tool === "string" ? payload.tool : "",
              label: payload.label,
            },
          }
        : null;
    case "delta":
      return typeof payload.text === "string" && payload.text
        ? { type: "delta", text: payload.text }
        : null;
    case "final":
      return typeof payload.answer === "string"
        ? {
            type: "final",
            response: {
              answer: payload.answer,
              memory: typeof payload.memory === "string" ? payload.memory : null,
              turn_id:
                typeof payload.turn_id === "string" ? payload.turn_id : null,
              blocks: Array.isArray(payload.blocks)
                ? (payload.blocks as AgentChatResponse["blocks"])
                : [],
              deep_link: isRecord(payload.deep_link)
                ? (payload.deep_link as AgentChatResponse["deep_link"])
                : null,
            },
          }
        : null;
    case "error":
      return {
        type: "error",
        code: typeof payload.code === "string" ? payload.code : "unknown",
        message: typeof payload.message === "string" ? payload.message : "",
      };
    default:
      return null;
  }
}
