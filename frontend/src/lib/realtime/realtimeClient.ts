/**
 * One WebSocket to `wss://<api>/api/v1/realtime` shared by every live-update hook.
 *
 * The server sends one JSON frame per change, shaped like a Supabase `postgres_changes` payload
 * (`{ table, eventType, new, old }`), so the cache handlers did not have to change. This class owns
 * the connection only: connect with the current access token, ping, reconnect with backoff, and
 * hand frames to the subscribers of that table. It has no native or auth imports: those are
 * injected (`RealtimeDeps`), which keeps it testable. The app wires the real ones in `index.ts`.
 */

export type RealtimeTable = "transactions" | "categories";

export type RealtimeEvent = {
  table: RealtimeTable;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

export type RealtimeSubscription = {
  table: RealtimeTable;
  onChange: (event: RealtimeEvent) => void;
  /**
   * Called each time the socket is open again after having been down (not on the first connect).
   * Changes made in the gap were never delivered, so refetch what this subscription feeds.
   */
  onResync?: () => void;
};

/** The subset of the WebSocket API used here. */
export type SocketLike = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number }) => void) | null;
  onerror: (() => void) | null;
};

export type RealtimeDeps = {
  /** A usable access token (refreshing if needed); null when signed out; rejects when offline. */
  getAccessToken: () => Promise<string | null>;
  /** Opens the socket with `Authorization: Bearer <token>`. */
  createSocket: (url: string, token: string) => SocketLike;
  /** API origin, e.g. `https://api.example.com` (empty when not configured). */
  baseUrl: () => string;
  /** Called with the access token whenever the session changes; returns unsubscribe. */
  onAccessTokenChange: (listener: (token: string | null) => void) => () => void;
  /** Called with true when the app comes to the foreground; returns unsubscribe. */
  onAppActive: (listener: () => void) => () => void;
  random?: () => number;
  onError?: (error: unknown, context: string) => void;
};

const OPEN = 1;
export const PING_INTERVAL_MS = 25_000;
/** No frame within this long after a ping = the socket is dead. */
export const PONG_TIMEOUT_MS = 10_000;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
/** The server closes a socket with this code when its access token has expired. */
export const CLOSE_TOKEN_EXPIRED = 4001;

export function realtimeUrl(baseUrl: string): string | null {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    return null;
  }
  return `${base.replace(/^http/i, "ws")}/api/v1/realtime`;
}

export class RealtimeClient {
  private readonly subs = new Set<RealtimeSubscription>();
  private socket: SocketLike | null = null;
  private running = false;
  /** Bumped on every (re)connect attempt and on stop, so late async results can tell they are stale. */
  private generation = 0;
  private attempt = 0;
  private everOpened = false;
  private connectedToken: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeToken: (() => void) | null = null;
  private unsubscribeActive: (() => void) | null = null;

  constructor(private readonly deps: RealtimeDeps) {}

  /** Start receiving; the socket opens with the first subscriber and closes with the last. */
  subscribe(subscription: RealtimeSubscription): () => void {
    this.subs.add(subscription);
    if (!this.running) {
      this.start();
    }
    return () => {
      this.subs.delete(subscription);
      if (this.subs.size === 0) {
        this.stop();
      }
    };
  }

  /** Whether a socket is currently open (for tests and diagnostics). */
  get isOpen(): boolean {
    return this.socket?.readyState === OPEN;
  }

  private start(): void {
    this.running = true;
    this.attempt = 0;
    this.everOpened = false;
    this.unsubscribeToken = this.deps.onAccessTokenChange((token) => {
      // A refreshed token: reconnect so the socket always carries a live one.
      if (this.running && token && token !== this.connectedToken) {
        this.reconnectNow();
      }
    });
    this.unsubscribeActive = this.deps.onAppActive(() => {
      if (!this.running) {
        return;
      }
      if (this.socket?.readyState === OPEN) {
        this.sendPing(); // may be dead after time in the background
      } else {
        this.reconnectNow();
      }
    });
    void this.connect();
  }

  private stop(): void {
    this.running = false;
    this.generation += 1;
    this.unsubscribeToken?.();
    this.unsubscribeActive?.();
    this.unsubscribeToken = null;
    this.unsubscribeActive = null;
    this.clearTimers();
    this.detachSocket(1000);
    this.connectedToken = null;
  }

  private clearTimers(): void {
    for (const timer of [this.reconnectTimer, this.pingTimer, this.pongTimer]) {
      if (timer) {
        clearTimeout(timer);
      }
    }
    this.reconnectTimer = this.pingTimer = this.pongTimer = null;
  }

  /** Forget the current socket without waiting for its close event. */
  private detachSocket(code?: number): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) {
      return;
    }
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try {
      socket.close(code);
    } catch {
      // already closed
    }
  }

  private async connect(): Promise<void> {
    if (!this.running) {
      return;
    }
    const generation = ++this.generation;
    const url = realtimeUrl(this.deps.baseUrl());
    if (!url) {
      return; // EXPO_PUBLIC_API_BASE_URL is missing or not http(s): nothing to connect to
    }

    let token: string | null;
    try {
      token = await this.deps.getAccessToken();
    } catch {
      // Offline (the refresh could not reach the server): the session is kept, try again later.
      if (generation === this.generation) {
        this.scheduleReconnect();
      }
      return;
    }
    if (generation !== this.generation || !this.running) {
      return;
    }
    if (!token) {
      return; // signed out: the hooks unsubscribe on their own
    }

    let socket: SocketLike;
    try {
      socket = this.deps.createSocket(url, token);
    } catch (error) {
      this.deps.onError?.(error, "realtime createSocket");
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.connectedToken = token;

    socket.onopen = () => {
      if (generation !== this.generation) {
        return;
      }
      this.attempt = 0;
      const wasDown = this.everOpened;
      this.everOpened = true;
      this.schedulePing();
      if (wasDown) {
        for (const sub of [...this.subs]) {
          this.safely(() => sub.onResync?.(), "realtime resync");
        }
      }
    };
    socket.onmessage = (event) => {
      if (generation !== this.generation) {
        return;
      }
      this.onFrame(event.data);
    };
    socket.onerror = () => {
      // A close event follows; reconnecting is handled there.
    };
    socket.onclose = (event) => {
      if (generation !== this.generation) {
        return;
      }
      this.socket = null;
      this.clearTimers();
      if (!this.running) {
        return;
      }
      if (event.code === CLOSE_TOKEN_EXPIRED) {
        this.attempt = 0;
        void this.connect(); // getAccessToken refreshes the expired token first
        return;
      }
      this.scheduleReconnect();
    };
  }

  private onFrame(data: unknown): void {
    // Any frame proves the connection is alive.
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
    if (typeof data !== "string" || data === "pong") {
      return;
    }
    let event: RealtimeEvent;
    try {
      event = JSON.parse(data) as RealtimeEvent;
    } catch {
      return;
    }
    if (!event || typeof event.table !== "string") {
      return;
    }
    for (const sub of [...this.subs]) {
      if (sub.table === event.table) {
        this.safely(() => sub.onChange(event), "realtime handler");
      }
    }
  }

  private safely(fn: () => void, context: string): void {
    try {
      fn();
    } catch (error) {
      this.deps.onError?.(error, context);
    }
  }

  private schedulePing(): void {
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
    }
    this.pingTimer = setTimeout(() => {
      this.sendPing();
      this.schedulePing();
    }, PING_INTERVAL_MS);
  }

  private sendPing(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN) {
      return;
    }
    try {
      socket.send("ping");
    } catch {
      this.dropAndReconnect();
      return;
    }
    if (!this.pongTimer) {
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        this.dropAndReconnect();
      }, PONG_TIMEOUT_MS);
    }
  }

  private dropAndReconnect(): void {
    this.clearTimers();
    this.detachSocket();
    this.generation += 1;
    this.scheduleReconnect();
  }

  /** Reconnect right away (foreground, fresh token), skipping the backoff. */
  private reconnectNow(): void {
    this.clearTimers();
    this.detachSocket(1000);
    this.attempt = 0;
    void this.connect();
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) {
      return;
    }
    const random = this.deps.random ?? Math.random;
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempt);
    this.attempt += 1;
    const delay = Math.round(base * (0.8 + 0.4 * random()));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}
