import { dimeApi } from "@/lib/api/dimeApi";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import type {
  AgentChatErrorBody,
  AgentChatHistoryMessage,
  AgentChatResponse,
} from "../types";

export type PostAgentChatInput = {
  content: string;
  history?: AgentChatHistoryMessage[];
  timezone?: string;
  signal?: AbortSignal;
};

export async function postAgentChat(
  input: PostAgentChatInput,
): Promise<AgentChatResponse> {
  const { data } = await dimeApi.post<AgentChatResponse | AgentChatErrorBody>(
    "/api/v1/agent/chat",
    {
      content: input.content,
      timezone: input.timezone ?? getDeviceIanaTimezone(),
      history: input.history ?? [],
    },
    { signal: input.signal },
  );
  if (typeof data === "object" && data !== null && "error" in data) {
    throw new Error(data.error.message || "The assistant could not answer.");
  }
  return data as AgentChatResponse;
}
