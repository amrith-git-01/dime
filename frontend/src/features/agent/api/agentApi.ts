import { dimeApi } from "@/lib/api/dimeApi";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import type { AgentChatHistoryMessage, AgentChatResponse } from "../types";

export type PostAgentChatInput = {
  content: string;
  history?: AgentChatHistoryMessage[];
  timezone?: string;
  signal?: AbortSignal;
};

export async function postAgentChat(
  input: PostAgentChatInput,
): Promise<AgentChatResponse> {
  const { data } = await dimeApi.post<AgentChatResponse>(
    "/api/v1/agent/chat",
    {
      content: input.content,
      timezone: input.timezone ?? getDeviceIanaTimezone(),
      history: input.history ?? [],
    },
    { signal: input.signal },
  );
  return data;
}
