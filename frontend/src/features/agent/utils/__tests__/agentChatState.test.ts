import type { AgentChatResponse, ChatMessage } from "../../types";
import {
  agentChatReducer,
  buildAgentHistory,
  initialAgentChatState,
  type AgentChatAction,
  type AgentChatState,
} from "../agentChatState";
import { getAgentErrorMessage } from "../agentErrorMessage";

function msg(
  over: Partial<ChatMessage> & Pick<ChatMessage, "id" | "role">,
): ChatMessage {
  return { content: "", blocks: [], deepLink: null, ...over };
}

function run(actions: AgentChatAction[], from = initialAgentChatState) {
  return actions.reduce(agentChatReducer, from);
}

function send(requestId: number, content = "q"): AgentChatAction {
  return {
    type: "send",
    requestId,
    userMessage: msg({ id: `u${requestId}`, role: "user", content }),
    assistantMessage: msg({
      id: `a${requestId}`,
      role: "assistant",
      isPending: true,
    }),
  };
}

const final = (over: Partial<AgentChatResponse> = {}): AgentChatResponse => ({
  answer: "Final answer",
  blocks: [],
  deep_link: null,
  memory: "mem-1",
  turn_id: "turn-1",
  ...over,
});

const last = (s: AgentChatState) => s.messages[s.messages.length - 1];

describe("agentChatReducer", () => {
  it("send adds the user message and a pending assistant placeholder", () => {
    const s = run([send(1)]);
    expect(s.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(s.activeRequestId).toBe(1);
    expect(last(s).isPending).toBe(true);
  });

  it("step sets the real progress label", () => {
    const s = run([
      send(1),
      { type: "step", requestId: 1, label: "Checking budgets" },
    ]);
    expect(last(s).stepLabel).toBe("Checking budgets");
  });

  it("delta appends to the in-progress assistant message", () => {
    const s = run([
      send(1),
      { type: "delta", requestId: 1, text: "You spent " },
      { type: "delta", requestId: 1, text: "₹500" },
    ]);
    expect(last(s).content).toBe("You spent ₹500");
    expect(last(s).isPending).toBe(true);
  });

  it("final replaces streamed text and attaches blocks, deep link and turn id", () => {
    const blocks: AgentChatResponse["blocks"] = [
      { type: "metric", label: "Spent", value: "₹500" },
    ];
    const deep_link = { screen: "Budgets", params: {} };
    const s = run([
      send(1),
      { type: "step", requestId: 1, label: "Working" },
      { type: "delta", requestId: 1, text: "draft text that gets replaced" },
      { type: "final", requestId: 1, response: final({ blocks, deep_link }) },
    ]);
    const a = last(s);
    expect(a.content).toBe("Final answer");
    expect(a.blocks).toEqual(blocks);
    expect(a.deepLink).toEqual(deep_link);
    expect(a.turnId).toBe("turn-1");
    expect(a.isPending).toBe(false);
    expect(a.stepLabel).toBeNull();
    expect(s.activeRequestId).toBeNull();
  });

  it("error turns the placeholder into an error message, discarding partial text", () => {
    const s = run([
      send(1),
      { type: "delta", requestId: 1, text: "partial" },
      { type: "error", requestId: 1, message: "Nope" },
    ]);
    expect(last(s)).toMatchObject({
      content: "Nope",
      isError: true,
      isPending: false,
    });
    expect(s.activeRequestId).toBeNull();
  });

  it("abort removes the placeholder", () => {
    const s = run([send(1), { type: "abort", requestId: 1 }]);
    expect(s.messages.map((m) => m.id)).toEqual(["u1"]);
    expect(s.activeRequestId).toBeNull();
  });

  it("ignores events from a stale request", () => {
    const afterFirst = run([
      send(1),
      { type: "final", requestId: 1, response: final() },
    ]);
    const s = run(
      [
        send(2, "second"),
        { type: "delta", requestId: 1, text: "STALE" },
        { type: "step", requestId: 1, label: "STALE" },
        {
          type: "final",
          requestId: 1,
          response: final({ answer: "STALE", memory: "stale" }),
        },
        { type: "error", requestId: 1, message: "STALE" },
        { type: "abort", requestId: 1 },
      ],
      afterFirst,
    );
    expect(last(s)).toMatchObject({ id: "a2", content: "", isPending: true });
    expect(s.memory).toBe("mem-1");
    expect(s.activeRequestId).toBe(2);
  });

  it("ignores request events after reset", () => {
    const s = run([
      send(1),
      { type: "reset" },
      { type: "final", requestId: 1, response: final() },
    ]);
    expect(s).toEqual(initialAgentChatState);
  });
});

describe("conversation memory", () => {
  it("stores memory from final, keeps it across turns and clears it on reset", () => {
    let s = run([send(1), { type: "final", requestId: 1, response: final() }]);
    expect(s.memory).toBe("mem-1");

    s = run(
      [
        send(2),
        {
          type: "final",
          requestId: 2,
          response: final({ memory: "mem-2" }),
        },
      ],
      s,
    );
    expect(s.memory).toBe("mem-2");

    // a final without memory keeps the last one
    s = run(
      [
        send(3),
        { type: "final", requestId: 3, response: final({ memory: null }) },
      ],
      s,
    );
    expect(s.memory).toBe("mem-2");

    // errors do not touch memory
    s = run([send(4), { type: "error", requestId: 4, message: "x" }], s);
    expect(s.memory).toBe("mem-2");

    expect(agentChatReducer(s, { type: "reset" }).memory).toBeNull();
  });
});

describe("feedback", () => {
  const answered = () =>
    run([send(1), { type: "final", requestId: 1, response: final() }]);

  it("applies the vote optimistically, once per message", () => {
    let s = agentChatReducer(answered(), {
      type: "feedback",
      messageId: "a1",
      rating: "up",
    });
    expect(last(s).feedback).toBe("up");
    s = agentChatReducer(s, {
      type: "feedback",
      messageId: "a1",
      rating: "down",
    });
    expect(last(s).feedback).toBe("up");
  });

  it("reverts when the request fails", () => {
    let s = agentChatReducer(answered(), {
      type: "feedback",
      messageId: "a1",
      rating: "down",
    });
    s = agentChatReducer(s, { type: "feedbackFailed", messageId: "a1" });
    expect(last(s).feedback).toBeNull();
  });

  it("ignores messages without a turn id", () => {
    const s = run([send(1), { type: "error", requestId: 1, message: "x" }]);
    const next = agentChatReducer(s, {
      type: "feedback",
      messageId: "a1",
      rating: "up",
    });
    expect(last(next).feedback).toBeUndefined();
  });
});

describe("buildAgentHistory", () => {
  it("sends only the last 3 user turns, skipping errors and assistant text", () => {
    const messages: ChatMessage[] = [
      msg({ id: "1", role: "user", content: "one" }),
      msg({ id: "2", role: "assistant", content: "answer" }),
      msg({ id: "3", role: "user", content: "two" }),
      msg({ id: "4", role: "user", content: "bad", isError: true }),
      msg({ id: "5", role: "user", content: "three" }),
      msg({ id: "6", role: "user", content: "  four  " }),
    ];
    expect(buildAgentHistory(messages)).toEqual([
      { role: "user", content: "two" },
      { role: "user", content: "three" },
      { role: "user", content: "four" },
    ]);
  });

  it("truncates long turns", () => {
    const [turn] = buildAgentHistory([
      msg({ id: "1", role: "user", content: "x".repeat(2000) }),
    ]);
    expect(turn.content).toHaveLength(500);
  });
});

describe("getAgentErrorMessage", () => {
  it("maps known codes to friendly copy and falls back to the server message", () => {
    expect(getAgentErrorMessage("daily_limit")).toMatch(/limit/i);
    expect(getAgentErrorMessage("daily_limit", "5 of 5 used")).toBe(
      "5 of 5 used",
    );
    expect(getAgentErrorMessage("agent_disabled")).toMatch(/off/i);
    expect(getAgentErrorMessage("weird", "Server says hi")).toBe(
      "Server says hi",
    );
    expect(getAgentErrorMessage("weird", "")).toMatch(/could not answer/i);
  });
});
