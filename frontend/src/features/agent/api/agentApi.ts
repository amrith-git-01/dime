import {
  dimeApi,
  getDimeApiBaseUrl,
  getDimeAuthHeaders,
} from "@/lib/api/dimeApi";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import type { AgentMessage, AgentSseEvent, AgentThread } from "../types";
import { parseAgentSseChunk } from "../utils/parseAgentSse";

type ThreadDto = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type MessageDto = {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  blocks_json: AgentMessage["blocks_json"];
  deep_link_json: AgentMessage["deep_link_json"];
  created_at: string;
};

function mapThread(dto: ThreadDto): AgentThread {
  return {
    id: dto.id,
    title: dto.title,
    created_at: dto.created_at,
    updated_at: dto.updated_at,
  };
}

function mapMessage(dto: MessageDto): AgentMessage {
  return {
    id: dto.id,
    thread_id: dto.thread_id,
    role: dto.role,
    content: dto.content,
    blocks_json: dto.blocks_json,
    deep_link_json: dto.deep_link_json,
    created_at: dto.created_at,
  };
}

export async function fetchAgentThreads(): Promise<AgentThread[]> {
  const { data } = await dimeApi.get<ThreadDto[]>("/api/v1/agent/threads");
  return data.map(mapThread);
}

export async function createAgentThread(title?: string): Promise<AgentThread> {
  const { data } = await dimeApi.post<ThreadDto>("/api/v1/agent/threads", {
    title: title ?? null,
  });
  return mapThread(data);
}

export async function fetchAgentMessages(
  threadId: string,
): Promise<AgentMessage[]> {
  const { data } = await dimeApi.get<MessageDto[]>(
    `/api/v1/agent/threads/${threadId}/messages`,
  );
  return data.map(mapMessage);
}

export async function deleteAgentThread(threadId: string): Promise<void> {
  await dimeApi.delete(`/api/v1/agent/threads/${threadId}`);
}

export type StreamAgentChatInput = {
  threadId: string;
  content: string;
  timezone?: string;
  onEvent: (event: AgentSseEvent) => void;
  signal?: AbortSignal;
};

/**
 * POST chat and parse SSE progressively (XHR for React Native compatibility).
 */
export function streamAgentChat(input: StreamAgentChatInput): Promise<void> {
  const base = getDimeApiBaseUrl();
  if (!base) {
    return Promise.reject(new Error("EXPO_PUBLIC_API_BASE_URL is not set"));
  }

  const url = `${base}/api/v1/agent/threads/${input.threadId}/chat`;
  const body = JSON.stringify({
    content: input.content,
    timezone: input.timezone ?? getDeviceIanaTimezone(),
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastIndex = 0;
    let remainder = "";
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const flushNewText = () => {
      const full = xhr.responseText;
      if (full.length <= lastIndex) {
        return;
      }
      const chunk = full.slice(lastIndex);
      lastIndex = full.length;
      remainder += chunk;
      const parsed = parseAgentSseChunk(remainder);
      remainder = parsed.remainder;
      for (const event of parsed.events) {
        input.onEvent(event);
      }
    };

    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "text/event-stream");

    void getDimeAuthHeaders().then((headers) => {
      for (const [key, value] of Object.entries(headers)) {
        xhr.setRequestHeader(key, value);
      }
      xhr.send(body);
    });

    xhr.onprogress = () => {
      flushNewText();
    };

    xhr.onload = () => {
      flushNewText();
      if (xhr.status >= 200 && xhr.status < 300) {
        finish();
        return;
      }
      let message = `Chat failed (${xhr.status})`;
      try {
        const json = JSON.parse(xhr.responseText) as { detail?: unknown };
        if (typeof json.detail === "string") {
          message = json.detail;
        }
      } catch {
        /* keep default */
      }
      finish(new Error(message));
    };

    xhr.onerror = () => {
      finish(new Error("Network error while chatting with agent"));
    };

    xhr.onabort = () => {
      finish(new Error("Chat cancelled"));
    };

    if (input.signal) {
      if (input.signal.aborted) {
        xhr.abort();
        return;
      }
      input.signal.addEventListener(
        "abort",
        () => {
          xhr.abort();
        },
        { once: true },
      );
    }
  });
}
