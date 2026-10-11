import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import { getDb } from '../../core/db';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { validate } from '../../core/validation';
import { googleBodySchema, refreshBodySchema, signOutBodySchema } from './schemas';
import * as service from './service';

/** Mounted at `/auth`. Sign-in and refresh are public (rate limited by IP); sign-out needs the access token. */
export const authRoutes = new Hono<AppBindings>();

authRoutes.post('/google', rateLimit('WRITE_LIMITER'), validate('json', googleBodySchema), async (c) => {
  const session = await service.signInWithGoogle(getDb(c), getConfig(c.env).auth, c.req.valid('json').id_token);
  return c.json(session);
});

authRoutes.post('/refresh', rateLimit('WRITE_LIMITER'), validate('json', refreshBodySchema), async (c) => {
  const session = await service.refresh(getDb(c), getConfig(c.env).auth.jwtSecret, c.req.valid('json').refresh_token);
  return c.json(session);
});

authRoutes.post('/sign-out', requireAuth, rateLimit('WRITE_LIMITER'), validate('json', signOutBodySchema), async (c) => {
  await service.signOut(getDb(c), currentUser(c), c.req.valid('json'), c.get('sessionId'));
  return c.body(null, 204);
});
