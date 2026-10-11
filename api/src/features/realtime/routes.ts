import { Hono } from 'hono';

import { verifyAccessToken } from '../../core/auth';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { AppError, ServiceUnavailableError, UnauthorizedError } from '../../core/errors';
import { EXP_HEADER } from './user-hub';

/** Mounted at `/realtime`. */
export const realtimeRoutes = new Hono<AppBindings>();

const BEARER_PROTOCOL_PREFIX = 'bearer.';

/**
 * The access token of an upgrade request: `Authorization: Bearer <token>` (what the React Native
 * app sends, through the non-standard `headers` option of its WebSocket) or, for clients that cannot
 * set headers, `Sec-WebSocket-Protocol: dime.v1, bearer.<token>`. Never the query string (URLs end up in logs).
 */
function tokenOf(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (header) {
    const space = header.indexOf(' ');
    if (space > 0 && header.slice(0, space).toLowerCase() === 'bearer') return header.slice(space + 1).trim() || null;
    return null;
  }
  const protocols = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((p) => p.trim());
  const bearer = protocols.find((p) => p.startsWith(BEARER_PROTOCOL_PREFIX));
  return bearer ? bearer.slice(BEARER_PROTOCOL_PREFIX.length) || null : null;
}

realtimeRoutes.get('/', async (c) => {
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
    throw new AppError(426, 'Expected a WebSocket upgrade.', { headers: { Upgrade: 'websocket' } });
  }
  const token = tokenOf(c.req.raw);
  if (!token) throw new UnauthorizedError('Not authenticated.');
  // Verified before upgrading, so a bad token is a plain 401.
  const payload = await verifyAccessToken(token, getConfig(c.env).auth.jwtSecret);
  const userId = payload.sub;
  if (typeof userId !== 'string' || !userId || typeof payload.exp !== 'number') throw new UnauthorizedError('Invalid token subject.');
  if (!c.env.USER_HUB) throw new ServiceUnavailableError('Realtime is not configured.');

  const headers = new Headers(c.req.raw.headers);
  headers.set(EXP_HEADER, String(payload.exp));
  return c.env.USER_HUB.get(c.env.USER_HUB.idFromName(userId)).fetch('https://user-hub/connect', { headers });
});
