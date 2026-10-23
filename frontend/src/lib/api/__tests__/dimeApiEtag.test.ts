import type { AxiosRequestConfig, AxiosResponse } from "axios";

import { dimeApi } from "../dimeApi";
import { etagCache } from "../etagCache";
import { bumpUserDataEpoch } from "@/lib/userDataEpoch";

const mockGetAccessToken = jest.fn();
const mockRefreshSession = jest.fn();
const mockGetSession = jest.fn();

jest.mock("@/lib/auth/session", () => ({
  getAccessToken: () => mockGetAccessToken(),
  getSession: () => mockGetSession(),
  refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
}));
jest.mock("@/lib/api/baseUrl", () => ({
  getDimeApiBaseUrl: () => "https://api.test",
}));

type Reply = {
  status: number;
  data?: unknown;
  headers?: Record<string, string>;
  /** Runs while the request is "on the wire" (after its headers were built). */
  onWire?: () => void;
};

/** Replace the network: `replies` are consumed in order, every request is recorded. */
function mockNetwork(replies: Reply[]) {
  const seen: AxiosRequestConfig[] = [];
  dimeApi.defaults.adapter = async (config) => {
    seen.push({ ...config, headers: config.headers });
    const reply = replies.shift();
    if (!reply) {
      throw new Error("unexpected request");
    }
    reply.onWire?.();
    const response = {
      data: reply.data ?? null,
      status: reply.status,
      statusText: "",
      headers: reply.headers ?? {},
      config,
    } as AxiosResponse;
    if (dimeApi.defaults.validateStatus?.(reply.status)) {
      return response;
    }
    const error = Object.assign(new Error(`status ${reply.status}`), {
      isAxiosError: true,
      response,
      config,
    });
    throw error;
  };
  return seen;
}

const ifNoneMatch = (config: AxiosRequestConfig | undefined) =>
  (config?.headers as { get(name: string): unknown } | undefined)?.get(
    "If-None-Match",
  );

beforeEach(() => {
  // dimeApi logs every request in __DEV__.
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  etagCache.clear();
  mockGetAccessToken.mockResolvedValue("tok-1");
  mockRefreshSession.mockReset();
  mockGetSession.mockReturnValue({ user: { id: "u1" } });
});

describe("dimeApi conditional GETs", () => {
  it("remembers a 200 with an ETag and revalidates with If-None-Match", async () => {
    const seen = mockNetwork([
      { status: 200, data: { n: 1 }, headers: { etag: 'W/"abc"' } },
      { status: 304, headers: { etag: 'W/"abc"' } },
    ]);

    const first = await dimeApi.get("/api/v1/x", { params: { b: 2, a: 1 } });
    expect(first.data).toEqual({ n: 1 });
    expect(ifNoneMatch(seen[0])).toBeUndefined();

    const second = await dimeApi.get("/api/v1/x", { params: { a: 1, b: 2 } });
    expect(ifNoneMatch(seen[1])).toBe('W/"abc"');
    // The 304 resolves as the cached 200 (same object, so structural sharing keeps its identity).
    expect(second.status).toBe(200);
    expect(second.data).toBe(first.data);
  });

  it("replaces the stored body when the server answers 200 with a new ETag", async () => {
    const seen = mockNetwork([
      { status: 200, data: { n: 1 }, headers: { etag: 'W/"1"' } },
      { status: 200, data: { n: 2 }, headers: { etag: 'W/"2"' } },
      { status: 304, headers: { etag: 'W/"2"' } },
    ]);
    await dimeApi.get("/api/v1/x");
    expect((await dimeApi.get("/api/v1/x")).data).toEqual({ n: 2 });
    const third = await dimeApi.get("/api/v1/x");
    expect(ifNoneMatch(seen[2])).toBe('W/"2"');
    expect(third.data).toEqual({ n: 2 });
  });

  it("drops the entry when a 200 comes back without an ETag", async () => {
    const seen = mockNetwork([
      { status: 200, data: 1, headers: { etag: 'W/"1"' } },
      { status: 200, data: 2 },
      { status: 200, data: 3 },
    ]);
    await dimeApi.get("/api/v1/x");
    await dimeApi.get("/api/v1/x");
    await dimeApi.get("/api/v1/x");
    expect(ifNoneMatch(seen[1])).toBe('W/"1"');
    expect(ifNoneMatch(seen[2])).toBeUndefined();
  });

  it("keeps separate entries per URL and params", async () => {
    const seen = mockNetwork([
      { status: 200, data: "a", headers: { etag: "ea" } },
      { status: 200, data: "b", headers: { etag: "eb" } },
      { status: 304 },
    ]);
    await dimeApi.get("/api/v1/x", { params: { p: 1 } });
    await dimeApi.get("/api/v1/x", { params: { p: 2 } });
    expect(ifNoneMatch(seen[1])).toBeUndefined();
    const again = await dimeApi.get("/api/v1/x", { params: { p: 1 } });
    expect(ifNoneMatch(seen[2])).toBe("ea");
    expect(again.data).toBe("a");
  });

  it("never sends If-None-Match on writes and does not cache them", async () => {
    const seen = mockNetwork([
      { status: 201, data: { ok: true }, headers: { etag: "zzz" } },
      { status: 201, data: { ok: true } },
    ]);
    await dimeApi.post("/api/v1/x", {});
    await dimeApi.post("/api/v1/x", {});
    expect(ifNoneMatch(seen[1])).toBeUndefined();
    expect(etagCache.size).toBe(0);
  });

  it("respects a caller that sets its own If-None-Match", async () => {
    mockNetwork([{ status: 200, data: 1, headers: { etag: "e1" } }]);
    await dimeApi.get("/api/v1/x");
    const seen = mockNetwork([{ status: 200, data: 2, headers: { etag: "e2" } }]);
    await dimeApi.get("/api/v1/x", { headers: { "If-None-Match": "custom" } });
    expect(ifNoneMatch(seen[0])).toBe("custom");
  });

  it("re-requests without a validator when a 304 arrives after the entry was wiped", async () => {
    const seen = mockNetwork([
      { status: 200, data: { n: 1 }, headers: { etag: "e1" } },
      // The wipe lands while the conditional request is in flight.
      { status: 304, onWire: () => etagCache.clear() },
      { status: 200, data: { n: 5 }, headers: { etag: "e5" } },
    ]);
    await dimeApi.get("/api/v1/x");
    const res = await dimeApi.get("/api/v1/x");
    expect(res.data).toEqual({ n: 5 });
    expect(ifNoneMatch(seen[1])).toBe("e1");
    expect(ifNoneMatch(seen[2])).toBeUndefined();
  });

  it("re-sends the validator when the 401 refresh retry re-runs the request", async () => {
    mockRefreshSession.mockResolvedValue({ access_token: "tok-2" });
    const seen = mockNetwork([
      { status: 200, data: { n: 1 }, headers: { etag: "e1" } },
      { status: 401, data: { detail: "expired" } },
      { status: 304 },
    ]);
    await dimeApi.get("/api/v1/x");
    const res = await dimeApi.get("/api/v1/x");
    expect(res.data).toEqual({ n: 1 });
    expect(ifNoneMatch(seen[1])).toBe("e1");
    expect(ifNoneMatch(seen[2])).toBe("e1");
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  it("a GET answered after a wipe does not repopulate the cache", async () => {
    mockNetwork([{ status: 200, data: { n: 1 }, headers: { etag: "e1" }, onWire: () => bumpUserDataEpoch() }]);
    const res = await dimeApi.get("/api/v1/x");
    expect(res.data).toEqual({ n: 1 });
    expect(etagCache.size).toBe(0);
  });

  it("a 304 answered after a wipe is cancelled, not resolved with another account's body", async () => {
    mockNetwork([
      { status: 200, data: { n: 1 }, headers: { etag: "e1" } },
      { status: 304, onWire: () => bumpUserDataEpoch() },
    ]);
    await dimeApi.get("/api/v1/x");
    await expect(dimeApi.get("/api/v1/x")).rejects.toMatchObject({ name: "CanceledError" });
  });
});

describe("dimeApi outbox requests", () => {
  it("go out for the user they were made for", async () => {
    const seen = mockNetwork([{ status: 201, data: { ok: true } }]);
    await dimeApi.post("/api/v1/transactions", {}, { _outboxUserId: "u1" });
    expect(seen).toHaveLength(1);
  });

  it("are refused when another user is signed in, before anything is sent", async () => {
    mockGetSession.mockReturnValue({ user: { id: "u2" } });
    const seen = mockNetwork([{ status: 201, data: { ok: true } }]);
    await expect(dimeApi.post("/api/v1/transactions", {}, { _outboxUserId: "u1" })).rejects.toMatchObject({
      name: "SessionChangedError",
    });
    expect(seen).toHaveLength(0);
  });

  it("are refused when the account changed while the token was being fetched", async () => {
    mockGetAccessToken.mockImplementation(async () => {
      mockGetSession.mockReturnValue({ user: { id: "u2" } });
      return "tok-2";
    });
    const seen = mockNetwork([{ status: 201 }]);
    await expect(dimeApi.post("/api/v1/transactions", {}, { _outboxUserId: "u1" })).rejects.toMatchObject({ name: "SessionChangedError" });
    expect(seen).toHaveLength(0);
  });

  it("a 401 never refreshes and resends into a different session", async () => {
    const seen = mockNetwork([{ status: 401, data: { detail: "expired" }, onWire: () => mockGetSession.mockReturnValue({ user: { id: "u2" } }) }]);
    await expect(dimeApi.post("/api/v1/transactions", {}, { _outboxUserId: "u1" })).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
  });

  it("a 401 for the same user still refreshes once and retries", async () => {
    mockRefreshSession.mockResolvedValue({ access_token: "tok-2" });
    const seen = mockNetwork([
      { status: 401, data: { detail: "expired" } },
      { status: 201, data: { ok: true } },
    ]);
    const res = await dimeApi.post("/api/v1/transactions", {}, { _outboxUserId: "u1" });
    expect(res.status).toBe(201);
    expect(seen).toHaveLength(2);
  });
});
