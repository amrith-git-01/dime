import { DurableObject } from 'cloudflare:workers';

import type { Bindings } from '../../core/env';
import { log } from '../../core/logging';
import type { ChangeEvent } from './events';

/** Close code sent when a socket's access token has expired; the app reconnects with a fresh one. */
export const CLOSE_TOKEN_EXPIRED = 4001;
/** Set by the Worker (never taken from the client) when it forwards the upgrade. */
export const EXP_HEADER = 'x-dime-exp';
export const SUBPROTOCOL = 'dime.v1';

interface Attachment {
  /** Access-token expiry, unix seconds. */
  exp: number;
}

const RESERVED_CLOSE_CODES = new Set([1005, 1006, 1015]);

/**
 * One instance per user (`idFromName(userId)`): holds that user's open app sockets and fans out
 * change events to them. Uses the WebSocket Hibernation API, so an idle hub is evicted from memory
 * while the sockets stay open; nothing lives in instance fields (the token expiry rides in each
 * socket's attachment). `ping` is answered by the runtime without waking the object.
 *
 * Expiry: a socket is closed with 4001 when a message or a broadcast finds its token expired.
 * The app also reconnects after every token refresh, so a live socket is normally replaced first.
 */
export class UserHub extends DurableObject<Bindings> {
  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /** WebSocket upgrade, forwarded by `GET /api/v1/realtime` after it verified the token. */
  override fetch(request: Request): Response {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }
    const exp = Number(request.headers.get(EXP_HEADER));
    if (!Number.isFinite(exp)) return new Response('Missing token expiry.', { status: 400 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ exp } satisfies Attachment);

    const offered = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((p) => p.trim());
    const headers = offered.includes(SUBPROTOCOL) ? { 'Sec-WebSocket-Protocol': SUBPROTOCOL } : undefined;
    return new Response(null, { status: 101, webSocket: client, ...(headers ? { headers } : {}) });
  }

  /** RPC from the Worker: send each event, as one JSON text frame, to every live socket. */
  broadcast(events: ChangeEvent[]): void {
    const frames = events.map((e) => JSON.stringify(e));
    for (const ws of this.ctx.getWebSockets()) {
      if (this.closeIfExpired(ws)) continue;
      try {
        for (const frame of frames) ws.send(frame);
      } catch (err) {
        log.warn('realtime_send_failed', { err });
      }
    }
  }

  override webSocketMessage(ws: WebSocket, _message: string | ArrayBuffer): void {
    // Clients only send `ping` (auto-answered). Anything else is ignored, but still a chance to expire the socket.
    this.closeIfExpired(ws);
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    try {
      ws.close(RESERVED_CLOSE_CODES.has(code) || code < 1000 ? 1000 : code);
    } catch {
      // already closed
    }
  }

  override webSocketError(ws: WebSocket, error: unknown): void {
    log.warn('realtime_socket_error', { err: error });
    try {
      ws.close(1011, 'error');
    } catch {
      // already closed
    }
  }

  private closeIfExpired(ws: WebSocket): boolean {
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (attachment && attachment.exp > Date.now() / 1000) return false;
    try {
      ws.close(CLOSE_TOKEN_EXPIRED, 'token expired');
    } catch {
      // already closed
    }
    return true;
  }
}
