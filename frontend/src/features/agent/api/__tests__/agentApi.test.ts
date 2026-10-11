import { streamAgentChat, type AgentStreamHandlers } from "../agentApi";

const mockFetch = jest.fn();
const mockGetHeaders = jest.fn();
const mockRefreshHeaders = jest.fn();

jest.mock("expo/fetch", () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));
jest.mock("@/lib/api/dimeApi", () => ({
  dimeApi: { post: jest.fn() },
  getDimeApiBaseUrl: () => "https://api.test",
  getDimeAuthHeaders: () => mockGetHeaders(),
  refreshDimeAuthHeaders: () => mockRefreshHeaders(),
}));
jest.mock("@/utils/deviceTimezone", () => ({
  getDeviceIanaTimezone: () => "Asia/Kolkata",
}));

const encoder = new TextEncoder();

function sseResponse(chunks: string[]) {
  let i = 0;
  return {
    status: 200,
    ok: true,
    headers: { get: () => "text/event-stream; charset=utf-8" },
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: encoder.encode(chunks[i++]) }
            : { done: true, value: undefined },
        cancel: async () => undefined,
      }),
    },
    json: async () => {
      throw new Error("not json");
    },
  };
}

function jsonResponse(data: unknown, status = 200) {
  return {
    status,
    ok: status < 400,
    headers: { get: () => "application/json" },
    body: null,
    json: async () => data,
  };
}

function makeHandlers() {
  const events: unknown[] = [];
  const handlers: AgentStreamHandlers = {
    onStep: (s) => events.push(["step", s.label]),
    onDelta: (t) => events.push(["delta", t]),
    onFinal: (r) => events.push(["final", r]),
    onError: (e) => events.push(["error", e.code, e.message]),
  };
  return { handlers, events };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockGetHeaders.mockReset().mockResolvedValue({ Authorization: "Bearer old" });
  mockRefreshHeaders
    .mockReset()
    .mockResolvedValue({ Authorization: "Bearer new" });
});

describe("streamAgentChat", () => {
  it("streams step, delta and final events and sends memory + SSE headers", async () => {
    mockFetch.mockResolvedValue(
      sseResponse([
        'event: step\ndata: {"tool":"t","label":"Looking"}\n\nevent: del',
        'ta\ndata: {"text":"Hi "}\n\nevent: delta\ndata: {"text":"there"}\n\n',
        'event: final\ndata: {"answer":"Hi there","blocks":[],"deep_link":null,"memory":"M","turn_id":"T"}\n\n',
      ]),
    );
    const { handlers, events } = makeHandlers();
    await streamAgentChat(
      {
        content: "hello",
        history: [{ role: "user", content: "x" }],
        memory: "prev",
      },
      handlers,
    );

    expect(events).toEqual([
      ["step", "Looking"],
      ["delta", "Hi "],
      ["delta", "there"],
      [
        "final",
        {
          answer: "Hi there",
          blocks: [],
          deep_link: null,
          memory: "M",
          turn_id: "T",
        },
      ],
    ]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.test/api/v1/agent/chat");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer old",
      Accept: "text/event-stream",
    });
    expect(JSON.parse(init.body)).toEqual({
      content: "hello",
      timezone: "Asia/Kolkata",
      history: [{ role: "user", content: "x" }],
      memory: "prev",
    });
  });

  it("omits memory when there is none", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ answer: "A", blocks: [], deep_link: null }),
    );
    await streamAgentChat({ content: "q" }, makeHandlers().handlers);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).not.toHaveProperty(
      "memory",
    );
  });

  it("reports an error event", async () => {
    mockFetch.mockResolvedValue(
      sseResponse([
        'event: error\ndata: {"code":"daily_limit","message":"m"}\n\n',
      ]),
    );
    const { handlers, events } = makeHandlers();
    await streamAgentChat({ content: "q" }, handlers);
    expect(events).toEqual([["error", "daily_limit", "m"]]);
  });

  it("reports stream_incomplete when the stream ends without a terminal event", async () => {
    mockFetch.mockResolvedValue(
      sseResponse(['event: delta\ndata: {"text":"x"}\n\n']),
    );
    const { handlers, events } = makeHandlers();
    await streamAgentChat({ content: "q" }, handlers);
    expect(events).toEqual([
      ["delta", "x"],
      ["error", "stream_incomplete", ""],
    ]);
  });

  it("falls back to a JSON answer when the response is not an event stream", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        answer: "A",
        blocks: [{ type: "metric" }],
        deep_link: null,
        memory: "M",
      }),
    );
    const { handlers, events } = makeHandlers();
    await streamAgentChat({ content: "q" }, handlers);
    expect(events).toEqual([
      [
        "final",
        {
          answer: "A",
          blocks: [{ type: "metric" }],
          deep_link: null,
          memory: "M",
          turn_id: null,
        },
      ],
    ]);
  });

  it("maps a C5 JSON error body", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: { code: "agent_disabled", message: "off" } }),
    );
    const { handlers, events } = makeHandlers();
    await streamAgentChat({ content: "q" }, handlers);
    expect(events).toEqual([["error", "agent_disabled", "off"]]);
  });

  it("refreshes the token and retries once on 401", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(
        jsonResponse({ answer: "A", blocks: [], deep_link: null }),
      );
    const { handlers, events } = makeHandlers();
    await streamAgentChat({ content: "q" }, handlers);
    expect(mockRefreshHeaders).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe("Bearer new");
    expect((events[0] as unknown[])[0]).toBe("final");
  });

  it("gives up with unauthorized when the refresh fails", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 401));
    mockRefreshHeaders.mockResolvedValue({});
    const { handlers, events } = makeHandlers();
    await streamAgentChat({ content: "q" }, handlers);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(events).toEqual([["error", "unauthorized", ""]]);
  });

  it("reports a refresh that cannot reach the server as a network error", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 401));
    mockRefreshHeaders.mockRejectedValue(new Error("Can't reach the server."));
    const { handlers, events } = makeHandlers();
    await streamAgentChat({ content: "q" }, handlers);
    expect(events).toEqual([["error", "network", "Can't reach the server."]]);
  });

  it("surfaces the 429 detail as the daily limit message", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ detail: "You've used all 5 questions for today." }, 429),
    );
    const { handlers, events } = makeHandlers();
    await streamAgentChat({ content: "q" }, handlers);
    expect(events).toEqual([
      ["error", "daily_limit", "You've used all 5 questions for today."],
    ]);
  });

  it("reports network failures", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    const { handlers, events } = makeHandlers();
    await streamAgentChat({ content: "q" }, handlers);
    expect(events).toEqual([["error", "network", "offline"]]);
  });

  it("stays silent when aborted by the caller", async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(async () => {
      controller.abort();
      throw new Error("aborted");
    });
    const { handlers, events } = makeHandlers();
    await streamAgentChat({ content: "q", signal: controller.signal }, handlers);
    expect(events).toEqual([]);
  });
});
