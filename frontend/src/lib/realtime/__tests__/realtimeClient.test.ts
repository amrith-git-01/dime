import {
  BACKOFF_MAX_MS,
  CLOSE_TOKEN_EXPIRED,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  RealtimeClient,
  realtimeUrl,
  type RealtimeDeps,
  type RealtimeEvent,
  type SocketLike,
} from "../realtimeClient";

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closedWith: number | undefined;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code?: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    readonly url: string,
    readonly token: string,
  ) {}
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code;
    this.readyState = 3;
  }
  // test controls
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: unknown) {
    this.onmessage?.({ data });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function setup(over: Partial<RealtimeDeps> = {}) {
  const sockets: FakeSocket[] = [];
  let tokenListener: ((token: string | null) => void) | null = null;
  let activeListener: (() => void) | null = null;
  let token: string | null = "token-1";
  const deps: RealtimeDeps = {
    getAccessToken: jest.fn(() => Promise.resolve(token)),
    baseUrl: () => "https://api.test",
    createSocket: (url, t) => {
      const s = new FakeSocket(url, t);
      sockets.push(s);
      return s;
    },
    onAccessTokenChange: (l) => {
      tokenListener = l;
      return () => {
        tokenListener = null;
      };
    },
    onAppActive: (l) => {
      activeListener = l;
      return () => {
        activeListener = null;
      };
    },
    random: () => 0.5, // jitter factor 1.0
    onError: jest.fn(),
    ...over,
  };
  const client = new RealtimeClient(deps);
  return {
    client,
    deps,
    sockets,
    last: () => sockets[sockets.length - 1] as FakeSocket,
    setToken: (t: string | null) => {
      token = t;
    },
    emitToken: (t: string | null) => tokenListener?.(t),
    foreground: () => activeListener?.(),
    hasListeners: () => tokenListener !== null || activeListener !== null,
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

const tx = (id: string): RealtimeEvent => ({
  table: "transactions",
  eventType: "INSERT",
  new: { id },
  old: {},
});

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("realtimeUrl", () => {
  it("derives ws(s) from the API origin", () => {
    expect(realtimeUrl("https://api.example.com")).toBe(
      "wss://api.example.com/api/v1/realtime",
    );
    expect(realtimeUrl("http://10.0.2.2:8787/")).toBe(
      "ws://10.0.2.2:8787/api/v1/realtime",
    );
  });
  it("is null without a usable origin", () => {
    expect(realtimeUrl("")).toBeNull();
    expect(realtimeUrl("api.example.com")).toBeNull();
  });
});

describe("RealtimeClient connection", () => {
  it("connects with the access token once the first subscriber arrives", async () => {
    const t = setup();
    t.client.subscribe({ table: "transactions", onChange: jest.fn() });
    await flush();
    expect(t.sockets).toHaveLength(1);
    expect(t.sockets[0]?.url).toBe("wss://api.test/api/v1/realtime");
    expect(t.sockets[0]?.token).toBe("token-1");
  });

  it("shares one socket between subscribers and closes it with the last", async () => {
    const t = setup();
    const un1 = t.client.subscribe({
      table: "transactions",
      onChange: jest.fn(),
    });
    const un2 = t.client.subscribe({
      table: "categories",
      onChange: jest.fn(),
    });
    await flush();
    expect(t.sockets).toHaveLength(1);
    t.last().open();
    un1();
    expect(t.last().closedWith).toBeUndefined();
    un2();
    expect(t.sockets[0]?.closedWith).toBe(1000);
    expect(t.hasListeners()).toBe(false);
    // closed for good: no reconnect
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(t.sockets).toHaveLength(1);
  });

  it("does not connect when signed out", async () => {
    const t = setup();
    t.setToken(null);
    t.client.subscribe({ table: "transactions", onChange: jest.fn() });
    await flush();
    expect(t.sockets).toHaveLength(0);
  });

  it("does not connect without an API origin", async () => {
    const t = setup({ baseUrl: () => "" });
    t.client.subscribe({ table: "transactions", onChange: jest.fn() });
    await flush();
    expect(t.sockets).toHaveLength(0);
  });
});

describe("RealtimeClient dispatch", () => {
  it("hands each frame only to the subscribers of its table", async () => {
    const t = setup();
    const onTx = jest.fn();
    const onCat = jest.fn();
    t.client.subscribe({ table: "transactions", onChange: onTx });
    t.client.subscribe({ table: "categories", onChange: onCat });
    await flush();
    const socket = t.last();
    socket.open();

    socket.receive(JSON.stringify(tx("t1")));
    expect(onTx).toHaveBeenCalledWith(tx("t1"));
    expect(onCat).not.toHaveBeenCalled();

    const cat: RealtimeEvent = {
      table: "categories",
      eventType: "DELETE",
      new: {},
      old: { id: "c1" },
    };
    socket.receive(JSON.stringify(cat));
    expect(onCat).toHaveBeenCalledWith(cat);
    expect(onTx).toHaveBeenCalledTimes(1);
  });

  it("ignores pong, binary and malformed frames", async () => {
    const t = setup();
    const onChange = jest.fn();
    t.client.subscribe({ table: "transactions", onChange });
    await flush();
    const socket = t.last();
    socket.open();
    socket.receive("pong");
    socket.receive("{not json");
    socket.receive(new ArrayBuffer(2));
    socket.receive(JSON.stringify({ nope: true }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a throwing handler does not stop the others or the socket", async () => {
    const t = setup();
    const good = jest.fn();
    t.client.subscribe({
      table: "transactions",
      onChange: () => {
        throw new Error("boom");
      },
    });
    t.client.subscribe({ table: "transactions", onChange: good });
    await flush();
    const socket = t.last();
    socket.open();
    socket.receive(JSON.stringify(tx("t1")));
    expect(good).toHaveBeenCalledTimes(1);
    expect(t.deps.onError).toHaveBeenCalledTimes(1);
    expect(t.client.isOpen).toBe(true);
  });
});

describe("RealtimeClient reconnect", () => {
  it("backs off exponentially up to 30 s and resets once open", async () => {
    const t = setup();
    t.client.subscribe({ table: "transactions", onChange: jest.fn() });
    await flush();

    const delays: number[] = [];
    for (let i = 0; i < 8; i++) {
      const before = t.sockets.length;
      t.last().drop();
      let waited = 0;
      while (t.sockets.length === before && waited < 40_000) {
        jest.advanceTimersByTime(250);
        waited += 250;
        await flush();
      }
      delays.push(waited);
    }
    expect(delays).toEqual([
      1000,
      2000,
      4000,
      8000,
      16000,
      BACKOFF_MAX_MS,
      BACKOFF_MAX_MS,
      BACKOFF_MAX_MS,
    ]);

    // a successful open resets the ladder
    t.last().open();
    t.last().drop();
    jest.advanceTimersByTime(1000);
    await flush();
    expect(t.sockets.length).toBe(delays.length + 2);
  });

  it("calls onResync after a reconnect but not on the first open", async () => {
    const t = setup();
    const onResync = jest.fn();
    t.client.subscribe({
      table: "transactions",
      onChange: jest.fn(),
      onResync,
    });
    await flush();
    t.last().open();
    expect(onResync).not.toHaveBeenCalled();

    t.last().drop();
    jest.advanceTimersByTime(1000);
    await flush();
    t.last().open();
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it("reconnects at once, with a fresh token, when the server closes with 4001", async () => {
    const t = setup();
    t.client.subscribe({ table: "transactions", onChange: jest.fn() });
    await flush();
    t.last().open();
    t.setToken("token-2");
    t.last().drop(CLOSE_TOKEN_EXPIRED);
    await flush();
    expect(t.sockets).toHaveLength(2);
    expect(t.sockets[1]?.token).toBe("token-2");
  });

  it("reconnects when the session's access token changes, not when it stays the same", async () => {
    const t = setup();
    t.client.subscribe({ table: "transactions", onChange: jest.fn() });
    await flush();
    t.last().open();

    t.emitToken("token-1"); // same token as the open socket
    await flush();
    expect(t.sockets).toHaveLength(1);

    t.setToken("token-2");
    t.emitToken("token-2");
    await flush();
    expect(t.sockets).toHaveLength(2);
    expect(t.sockets[0]?.closedWith).toBe(1000);
    expect(t.sockets[1]?.token).toBe("token-2");
  });

  it("retries with backoff while the token cannot be fetched (offline), without a socket", async () => {
    let fail = true;
    const getAccessToken = jest.fn(() =>
      fail ? Promise.reject(new Error("offline")) : Promise.resolve("token-1"),
    );
    const t = setup({ getAccessToken });
    t.client.subscribe({ table: "transactions", onChange: jest.fn() });
    await flush();
    expect(t.sockets).toHaveLength(0);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(getAccessToken).toHaveBeenCalledTimes(2);
    fail = false;
    jest.advanceTimersByTime(2000);
    await flush();
    expect(t.sockets).toHaveLength(1);
  });

  it("reconnects immediately when the app returns to the foreground with a closed socket", async () => {
    const t = setup();
    t.client.subscribe({ table: "transactions", onChange: jest.fn() });
    await flush();
    t.last().open();
    t.last().drop();
    t.foreground();
    await flush();
    expect(t.sockets).toHaveLength(2);
  });

  it("pings an open socket on foreground to detect a dead one", async () => {
    const t = setup();
    t.client.subscribe({ table: "transactions", onChange: jest.fn() });
    await flush();
    const socket = t.last();
    socket.open();
    t.foreground();
    expect(socket.sent).toEqual(["ping"]);
    jest.advanceTimersByTime(PONG_TIMEOUT_MS + 1000);
    await flush();
    expect(t.sockets.length).toBeGreaterThan(1);
  });
});

describe("RealtimeClient heartbeat", () => {
  it("pings every 25 s and stays connected while pongs arrive", async () => {
    const t = setup();
    t.client.subscribe({ table: "transactions", onChange: jest.fn() });
    await flush();
    const socket = t.last();
    socket.open();

    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(PING_INTERVAL_MS);
      expect(socket.sent).toHaveLength(i + 1);
      socket.receive("pong");
    }
    await flush();
    expect(socket.sent.every((m) => m === "ping")).toBe(true);
    expect(t.sockets).toHaveLength(1);
  });

  it("reconnects when a ping is not answered", async () => {
    const t = setup();
    t.client.subscribe({ table: "transactions", onChange: jest.fn() });
    await flush();
    t.last().open();
    jest.advanceTimersByTime(PING_INTERVAL_MS);
    jest.advanceTimersByTime(PONG_TIMEOUT_MS);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(t.sockets).toHaveLength(2);
  });
});
