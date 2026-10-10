const DEFAULT_MESSAGE = "The assistant could not answer. Please try again.";

const FRIENDLY_MESSAGES: Record<string, string> = {
  daily_limit:
    "You've reached today's Dime Agent limit. It resets tomorrow, so try again then.",
  agent_disabled:
    "Dime Agent is switched off right now. Please try again later.",
  rate_limited: "You're sending messages too quickly. Wait a moment and retry.",
  unauthorized: "Your session expired. Please sign in again.",
  timeout: "That took too long. Please try again.",
  network: "Couldn't reach Dime. Check your connection and try again.",
  stream_incomplete: "The answer was cut off. Please try again.",
};

/** Friendly copy for an agent error code; falls back to the server message, then a generic line. */
export function getAgentErrorMessage(
  code: string | null | undefined,
  serverMessage?: string | null,
): string {
  // The server states the exact limit and reset time; prefer its wording.
  if (code === "daily_limit" && serverMessage?.trim()) {
    return serverMessage.trim();
  }
  if (code && FRIENDLY_MESSAGES[code]) {
    return FRIENDLY_MESSAGES[code];
  }
  return serverMessage?.trim() || DEFAULT_MESSAGE;
}
