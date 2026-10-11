import type { AuthSession } from "../types";

jest.mock("react-native-mmkv", () =>
  jest.requireActual("@/test-utils/mockMmkv"),
);
jest.mock("expo-secure-store", () => ({
  getItem: () => "0123456789abcdef0123456789abcdef",
  setItem: () => undefined,
}));
jest.mock("expo-crypto", () => ({ getRandomBytes: () => new Uint8Array(16) }));
jest.mock("@/lib/api/baseUrl", () => ({
  getDimeApiBaseUrl: () => "https://api.test",
}));

type SessionModule = typeof import("../session");
type StorageModule = typeof import("../authStorage");

const nowS = () => Math.floor(Date.now() / 1000);

function makeSession(over: Partial<AuthSession> = {}): AuthSession {
  return {
    access_token: "access-1",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: nowS() + 3600,
    refresh_token: "refresh-1",
    user: { id: "user-1", email: "a@example.com" },
    ...over,
  };
}

/** A fresh copy of the modules (module state is the session), optionally with a persisted session. */
function load(seed?: AuthSession): {
  session: SessionModule;
  storage: StorageModule;
} {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const storage = require("../authStorage") as StorageModule;
  if (seed) {
    storage.writeStoredAuthSession(seed);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const session = require("../session") as SessionModule;
  return { session, storage };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const sentBody = (call = 0) =>
  JSON.parse(fetchMock.mock.calls[call]?.[1].body as string) as Record<
    string,
    unknown
  >;

describe("session persistence", () => {
  it("loads the persisted session synchronously", () => {
    const stored = makeSession();
    const { session } = load(stored);
    expect(session.getSession()).toEqual(stored);
  });

  it("starts signed out with nothing stored", () => {
    expect(load().session.getSession()).toBeNull();
  });

  it("ignores a corrupt or incomplete stored value", () => {
    const { storage } = load();
    storage.writeStoredAuthSession({
      access_token: "x",
    } as unknown as AuthSession);
    expect(storage.readStoredAuthSession()).toBeNull();
  });
});

describe("getAccessToken", () => {
  it("returns the stored token without a request while it has more than a minute left", async () => {
    const { session } = load(makeSession());
    await expect(session.getAccessToken()).resolves.toBe("access-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when signed out", async () => {
    await expect(load().session.getAccessToken()).resolves.toBeNull();
  });

  it("refreshes when the token is within 60 s of expiring", async () => {
    const { session } = load(makeSession({ expires_at: nowS() + 30 }));
    const next = makeSession({
      access_token: "access-2",
      refresh_token: "refresh-2",
    });
    fetchMock.mockResolvedValue(jsonResponse(200, next));
    await expect(session.getAccessToken()).resolves.toBe("access-2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/api/v1/auth/refresh",
    );
    expect(sentBody()).toEqual({ refresh_token: "refresh-1" });
  });

  it("falls back to a token that has not expired yet when the refresh cannot reach the server", async () => {
    const { session } = load(makeSession({ expires_at: nowS() + 30 }));
    fetchMock.mockRejectedValue(new Error("Network request failed"));
    await expect(session.getAccessToken()).resolves.toBe("access-1");
  });

  it("throws AuthNetworkError for an expired token it cannot refresh, keeping the session", async () => {
    const { session } = load(makeSession({ expires_at: nowS() - 5 }));
    fetchMock.mockRejectedValue(new Error("Network request failed"));
    await expect(session.getAccessToken()).rejects.toBeInstanceOf(
      session.AuthNetworkError,
    );
    expect(session.getSession()?.refresh_token).toBe("refresh-1");
  });
});

describe("refreshSession", () => {
  it("is single-flight: concurrent callers share one request and one result", async () => {
    const { session } = load(makeSession({ expires_at: nowS() + 10 }));
    const next = makeSession({
      access_token: "access-2",
      refresh_token: "refresh-2",
    });
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );

    const results = Promise.all([
      session.refreshSession(),
      session.refreshSession(),
      session.getAccessToken(),
      session.getAccessToken(),
    ]);
    release(jsonResponse(200, next));
    const [a, b, c, d] = await results;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(c).toBe("access-2");
    expect(d).toBe("access-2");
  });

  it("persists the new pair before resolving", async () => {
    const { session, storage } = load(makeSession());
    const next = makeSession({
      access_token: "access-2",
      refresh_token: "refresh-2",
    });
    fetchMock.mockResolvedValue(jsonResponse(200, next));
    const seenByListener: (string | undefined)[] = [];
    session.subscribeSession(() => {
      seenByListener.push(storage.readStoredAuthSession()?.refresh_token);
    });

    await session.refreshSession();

    expect(storage.readStoredAuthSession()?.refresh_token).toBe("refresh-2");
    // already on disk when subscribers hear about it
    expect(seenByListener).toEqual(["refresh-2"]);
  });

  it("never sends the same refresh token twice: the second rotation uses the new one", async () => {
    const { session } = load(makeSession());
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          makeSession({ access_token: "a2", refresh_token: "refresh-2" }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          makeSession({ access_token: "a3", refresh_token: "refresh-3" }),
        ),
      );
    await session.refreshSession();
    await session.refreshSession();
    expect(sentBody(0)).toEqual({ refresh_token: "refresh-1" });
    expect(sentBody(1)).toEqual({ refresh_token: "refresh-2" });
  });

  it("answers 401 by clearing the session and telling subscribers", async () => {
    const { session, storage } = load(makeSession());
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: "revoked" }));
    const heard: (AuthSession | null)[] = [];
    session.subscribeSession((s) => heard.push(s));

    await expect(session.refreshSession()).resolves.toBeNull();

    expect(session.getSession()).toBeNull();
    expect(storage.readStoredAuthSession()).toBeNull();
    expect(heard).toEqual([null]);
  });

  it.each([
    ["a network error", () => Promise.reject(new Error("offline"))],
    ["a 503", () => Promise.resolve(jsonResponse(503, null))],
    ["a 429", () => Promise.resolve(jsonResponse(429, null))],
    ["a malformed 200", () => Promise.resolve(jsonResponse(200, { x: 1 }))],
  ])(
    "keeps the session on %s and rejects with AuthNetworkError",
    async (_name, respond) => {
      const stored = makeSession();
      const { session, storage } = load(stored);
      fetchMock.mockImplementation(respond);
      const heard: unknown[] = [];
      session.subscribeSession((s) => heard.push(s));

      await expect(session.refreshSession()).rejects.toBeInstanceOf(
        session.AuthNetworkError,
      );

      expect(session.getSession()).toEqual(stored);
      expect(storage.readStoredAuthSession()).toEqual(stored);
      expect(heard).toEqual([]);
      // and it can be retried afterwards
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          jsonResponse(
            200,
            makeSession({ access_token: "a2", refresh_token: "r2" }),
          ),
        ),
      );
      await expect(session.refreshSession()).resolves.toMatchObject({
        access_token: "a2",
      });
    },
  );

  it("skips the rotation when the failed token is already outdated", async () => {
    const { session } = load(makeSession({ access_token: "newer" }));
    await expect(
      session.refreshSession({ staleAccessToken: "older" }),
    ).resolves.toMatchObject({ access_token: "newer" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rotates when the failed token is the current one", async () => {
    const { session } = load(makeSession({ access_token: "current" }));
    fetchMock.mockResolvedValue(
      jsonResponse(
        200,
        makeSession({ access_token: "a2", refresh_token: "r2" }),
      ),
    );
    await session.refreshSession({ staleAccessToken: "current" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves null without a request when signed out", async () => {
    await expect(load().session.refreshSession()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops the result when the user signed out while the request was in flight", async () => {
    const { session, storage } = load(makeSession());
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );
    const pending = session.refreshSession();
    session.clearSession();
    release(
      jsonResponse(
        200,
        makeSession({ access_token: "a2", refresh_token: "r2" }),
      ),
    );
    await expect(pending).resolves.toBeNull();
    expect(session.getSession()).toBeNull();
    expect(storage.readStoredAuthSession()).toBeNull();
  });
});

describe("signInWithGoogleIdToken", () => {
  it("posts the id token, stores the session and notifies subscribers", async () => {
    const { session, storage } = load();
    const issued = makeSession({ user: { id: "u9", email: "z@example.com" } });
    fetchMock.mockResolvedValue(jsonResponse(200, issued));
    const heard: (AuthSession | null)[] = [];
    session.subscribeSession((s) => heard.push(s));

    await expect(
      session.signInWithGoogleIdToken("google-id-token"),
    ).resolves.toEqual(issued);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/api/v1/auth/google",
    );
    expect(sentBody()).toEqual({ id_token: "google-id-token" });
    expect(storage.readStoredAuthSession()).toEqual(issued);
    expect(heard).toEqual([issued]);
  });

  it("rejects with the server message when the token is refused", async () => {
    const { session } = load();
    fetchMock.mockResolvedValue(
      jsonResponse(401, { detail: "Invalid Google token." }),
    );
    await expect(session.signInWithGoogleIdToken("bad")).rejects.toThrow(
      "Invalid Google token.",
    );
    expect(session.getSession()).toBeNull();
  });

  it("reports an unreachable server as AuthNetworkError", async () => {
    const { session } = load();
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(session.signInWithGoogleIdToken("t")).rejects.toBeInstanceOf(
      session.AuthNetworkError,
    );
  });
});

describe("signOutRemote", () => {
  it("posts the scope and refresh token with the access token", async () => {
    const { session } = load(makeSession());
    fetchMock.mockResolvedValue(jsonResponse(204, null));
    await session.signOutRemote("global");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test/api/v1/auth/sign-out");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer access-1",
    );
    expect(sentBody()).toEqual({ scope: "global", refresh_token: "refresh-1" });
  });

  it("treats 401 (already revoked) as done and rejects on other failures", async () => {
    const { session } = load(makeSession());
    fetchMock.mockResolvedValueOnce(jsonResponse(401, null));
    await expect(session.signOutRemote("local")).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(jsonResponse(500, null));
    await expect(session.signOutRemote("local")).rejects.toBeInstanceOf(Error);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(session.signOutRemote("local")).rejects.toBeInstanceOf(Error);
  });

  it("does nothing when signed out", async () => {
    await expect(
      load().session.signOutRemote("global"),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
