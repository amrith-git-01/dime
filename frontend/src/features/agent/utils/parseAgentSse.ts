import type { AgentBlock, AgentSseEvent } from "../types";

function parseDataLine(line: string): unknown {
  const prefix = "data:";
  if (!line.startsWith(prefix)) {
    return null;
  }
  const raw = line.slice(prefix.length).trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function toSseEvent(eventName: string, data: unknown): AgentSseEvent | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const record = data as Record<string, unknown>;

  switch (eventName) {
    case "token":
      return typeof record.text === "string"
        ? { event: "token", text: record.text }
        : null;
    case "sql_start":
      return typeof record.round === "number"
        ? { event: "sql_start", round: record.round }
        : null;
    case "sql_end":
      return typeof record.round === "number"
        ? {
            event: "sql_end",
            round: record.round,
            row_count: Number(record.row_count ?? 0),
            summary: String(record.summary ?? ""),
          }
        : null;
    case "reflect":
      return {
        event: "reflect",
        status:
          record.status === "sufficient" ||
          record.status === "retry" ||
          record.status === "give_up"
            ? record.status
            : "retry",
        reason: String(record.reason ?? ""),
      };
    case "block": {
      const block = record.block;
      if (!block || typeof block !== "object") {
        return null;
      }
      return { event: "block", block: block as AgentBlock };
    }
    case "deep_link":
      return {
        event: "deep_link",
        screen: String(record.screen ?? ""),
        params:
          record.params && typeof record.params === "object"
            ? (record.params as Record<string, unknown>)
            : {},
      };
    case "done":
      return typeof record.message_id === "string"
        ? { event: "done", message_id: record.message_id }
        : null;
    case "error":
      return {
        event: "error",
        code: String(record.code ?? "error"),
        message: String(record.message ?? "Something went wrong"),
      };
    default:
      return null;
  }
}

/** Incremental SSE parser — pass cumulative buffer, get new events + remainder. */
export function parseAgentSseChunk(buffer: string): {
  events: AgentSseEvent[];
  remainder: string;
} {
  const events: AgentSseEvent[] = [];
  const chunks = buffer.split("\n\n");
  const remainder = chunks.pop() ?? "";

  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((line) => line.trim());
    let eventName = "message";
    let data: unknown = null;

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        data = parseDataLine(line);
      }
    }

    const parsed = toSseEvent(eventName, data);
    if (parsed) {
      events.push(parsed);
    }
  }

  return { events, remainder };
}
