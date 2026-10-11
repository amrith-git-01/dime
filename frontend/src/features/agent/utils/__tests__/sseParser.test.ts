import { decodeAgentStreamEvent } from "../agentStreamEvents";
import { createSseParser, type SseMessage } from "../sseParser";

function parse(chunks: string[]): SseMessage[] {
  const out: SseMessage[] = [];
  const parser = createSseParser((m) => out.push(m));
  chunks.forEach((c) => parser.feed(c));
  parser.end();
  return out;
}

describe("createSseParser", () => {
  it("parses event and data lines", () => {
    expect(parse(['event: step\ndata: {"a":1}\n\n'])).toEqual([
      { event: "step", data: '{"a":1}' },
    ]);
  });

  it("defaults the event name to message", () => {
    expect(parse(["data: hi\n\n"])).toEqual([{ event: "message", data: "hi" }]);
  });

  it("joins multi-line data with newlines", () => {
    expect(
      parse(["event: delta\ndata: a\ndata: b\ndata:\ndata: c\n\n"]),
    ).toEqual([{ event: "delta", data: "a\nb\n\nc" }]);
  });

  it("handles CRLF and bare CR line endings", () => {
    expect(
      parse(["event: a\r\ndata: 1\r\n\r\nevent: b\rdata: 2\r\r"]),
    ).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ]);
  });

  it("handles a CRLF split across chunks", () => {
    expect(parse(["event: a\r", "\ndata: 1\r", "\n\r", "\n"])).toEqual([
      { event: "a", data: "1" },
    ]);
  });

  it("reassembles lines and events split across arbitrary chunks", () => {
    const raw =
      'event: delta\ndata: {"text":"héllo"}\n\nevent: final\ndata: {}\n\n';
    const expected = parse([raw]);
    expect(expected).toHaveLength(2);
    for (let size = 1; size <= 7; size += 1) {
      const chunks: string[] = [];
      for (let i = 0; i < raw.length; i += size) {
        chunks.push(raw.slice(i, i + size));
      }
      expect(parse(chunks)).toEqual(expected);
    }
  });

  it("ignores comments and unknown fields, and strips only one leading space", () => {
    expect(
      parse([": keep-alive\nid: 7\nretry: 100\nevent:x\ndata:  two spaces\n\n"]),
    ).toEqual([{ event: "x", data: " two spaces" }]);
  });

  it("does not dispatch events without data", () => {
    expect(parse(["event: step\n\n\n\n"])).toEqual([]);
  });

  it("strips a leading BOM", () => {
    expect(parse(["﻿data: x\n\n"])).toEqual([
      { event: "message", data: "x" },
    ]);
  });

  it("dispatches an unterminated final event on end()", () => {
    expect(parse(["event: final\ndata: {}"])).toEqual([
      { event: "final", data: "{}" },
    ]);
  });
});

describe("decodeAgentStreamEvent", () => {
  const msg = (event: string, data: unknown): SseMessage => ({
    event,
    data: typeof data === "string" ? data : JSON.stringify(data),
  });

  it("decodes step, delta, final and error", () => {
    expect(
      decodeAgentStreamEvent(msg("step", { tool: "t", label: "L" })),
    ).toEqual({ type: "step", step: { tool: "t", label: "L" } });
    expect(decodeAgentStreamEvent(msg("delta", { text: "hi" }))).toEqual({
      type: "delta",
      text: "hi",
    });
    expect(
      decodeAgentStreamEvent(
        msg("final", { answer: "A", memory: "m", turn_id: "t1" }),
      ),
    ).toEqual({
      type: "final",
      response: {
        answer: "A",
        blocks: [],
        deep_link: null,
        memory: "m",
        turn_id: "t1",
      },
    });
    expect(
      decodeAgentStreamEvent(
        msg("error", { code: "daily_limit", message: "x" }),
      ),
    ).toEqual({ type: "error", code: "daily_limit", message: "x" });
  });

  it("returns null for malformed JSON, unknown events and invalid payloads", () => {
    expect(decodeAgentStreamEvent(msg("delta", "{nope"))).toBeNull();
    expect(decodeAgentStreamEvent(msg("ping", {}))).toBeNull();
    expect(decodeAgentStreamEvent(msg("step", { tool: "t" }))).toBeNull();
    expect(decodeAgentStreamEvent(msg("final", { blocks: [] }))).toBeNull();
    expect(decodeAgentStreamEvent(msg("delta", [1]))).toBeNull();
  });
});
