export type SseMessage = {
  /** `event:` field, `"message"` when absent. */
  event: string;
  /** `data:` lines joined with `\n`. */
  data: string;
};

type SseParser = {
  /** Feed a decoded text chunk; chunks may split lines or events anywhere. */
  feed: (chunk: string) => void;
  /** Stream ended: process any unterminated last line and pending event. */
  end: () => void;
};

/**
 * Incremental Server-Sent Events parser (WHATWG `text/event-stream` rules):
 * LF / CRLF / CR line endings, `:` comments, multi-line `data:`, one optional
 * space after the colon, events dispatched on a blank line.
 */
export function createSseParser(
  onMessage: (message: SseMessage) => void,
): SseParser {
  let buffer = "";
  let event = "";
  let dataLines: string[] = [];
  let atStart = true;

  function dispatch(): void {
    if (dataLines.length > 0) {
      onMessage({ event: event || "message", data: dataLines.join("\n") });
    }
    event = "";
    dataLines = [];
  }

  function processLine(line: string): void {
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) {
      return;
    }
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    if (field === "event") {
      event = value;
    } else if (field === "data") {
      dataLines.push(value);
    }
  }

  return {
    feed(chunk) {
      buffer += chunk;
      if (atStart && buffer.length > 0) {
        atStart = false;
        if (buffer.charCodeAt(0) === 0xfeff) {
          buffer = buffer.slice(1);
        }
      }
      let start = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const ch = buffer[i];
        if (ch === "\n") {
          processLine(buffer.slice(start, i));
          start = i + 1;
        } else if (ch === "\r") {
          if (i === buffer.length - 1) {
            // Possible CRLF split across chunks: wait for the next character.
            break;
          }
          processLine(buffer.slice(start, i));
          if (buffer[i + 1] === "\n") {
            i += 1;
          }
          start = i + 1;
        }
      }
      buffer = buffer.slice(start);
    },
    end() {
      if (buffer !== "") {
        processLine(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer);
        buffer = "";
      }
      dispatch();
    },
  };
}
