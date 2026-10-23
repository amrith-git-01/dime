import { AxiosError, AxiosHeaders } from "axios";

import { classifyFailure, SessionChangedError, SIGN_IN_AGAIN_MESSAGE, SubmitError } from "../failure";

function http(status: number, detail: string, headers: Record<string, string> = {}): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("Request failed", AxiosError.ERR_BAD_RESPONSE, config, null, {
    status,
    statusText: "",
    data: { detail },
    headers,
    config,
  });
}

describe("classifyFailure", () => {
  it("no answer at all (offline, reset, timeout) is a retry flagged offline", () => {
    for (const code of [AxiosError.ERR_NETWORK, AxiosError.ECONNABORTED, AxiosError.ETIMEDOUT]) {
      expect(classifyFailure(new AxiosError("x", code))).toMatchObject({ kind: "retry", offline: true });
    }
    expect(classifyFailure(new SubmitError("Request timed out.", { networkFailure: true }))).toMatchObject({
      kind: "retry",
      offline: true,
    });
  });

  it("AuthNetworkError and fetch's network failures are retries", () => {
    const authNetwork = new Error("Can't reach the server.");
    authNetwork.name = "AuthNetworkError";
    expect(classifyFailure(authNetwork)).toMatchObject({ kind: "retry", offline: true });
    expect(classifyFailure(new TypeError("Network request failed"))).toMatchObject({ kind: "retry", offline: true });
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    expect(classifyFailure(aborted).kind).toBe("retry");
  });

  it("5xx, 408 and 409 (still processing) are retries", () => {
    for (const status of [500, 502, 503, 504, 408, 409]) {
      expect(classifyFailure(http(status, "x"))).toMatchObject({ kind: "retry" });
      expect(classifyFailure(http(status, "x")).offline).toBeUndefined();
    }
  });

  it("a 401 that survived the token refresh needs the user: failed with a sign-in message, not retried for weeks", () => {
    expect(classifyFailure(http(401, "Not authenticated."))).toEqual({ kind: "fatal", message: SIGN_IN_AGAIN_MESSAGE });
    expect(classifyFailure(new SubmitError("Session expired", { status: 401 }))).toEqual({ kind: "fatal", message: SIGN_IN_AGAIN_MESSAGE });
  });

  it("a request refused because the account changed is not a server answer", () => {
    expect(classifyFailure(new SessionChangedError()).kind).toBe("retry");
  });

  it("a plain rate limit (429) is a retry that carries Retry-After", () => {
    expect(classifyFailure(http(429, "Too many requests", { "retry-after": "10" }))).toEqual({
      kind: "retry",
      message: "Too many requests",
      retryAfterSeconds: 10,
    });
  });

  it("the daily capture cap is a limit, matched on the server's exact wording", () => {
    expect(classifyFailure(http(429, "You've used today's 10 receipt scans. Try again tomorrow.", { "retry-after": "43200" }))).toEqual({
      kind: "limit",
      message: "You've used today's 10 receipt scans. Try again tomorrow.",
      retryAfterSeconds: 43200,
    });
    expect(classifyFailure(http(429, "Scanning is paused for today. Try again tomorrow.")).kind).toBe("limit");
    expect(classifyFailure(new SubmitError("You've used today's 1 voice capture. Try again tomorrow.", { status: 429, retryAfterSeconds: 60 })).kind).toBe("limit");
  });

  it("other 4xx are fatal with the server's message", () => {
    for (const status of [400, 403, 404, 413, 415, 422]) {
      expect(classifyFailure(http(status, "Bad thing"))).toEqual({ kind: "fatal", message: "Bad thing" });
    }
  });

  it("unknown errors are fatal (never looped silently)", () => {
    expect(classifyFailure(new Error("disk full"))).toEqual({ kind: "fatal", message: "disk full" });
    expect(classifyFailure("weird").kind).toBe("fatal");
  });
});
