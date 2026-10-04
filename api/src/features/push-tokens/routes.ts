import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { getSupabase } from '../../core/supabase';
import { validate } from '../../core/validation';
import * as repo from './repository';
import { pushTokenBodySchema, pushTokenDeleteBodySchema } from './schemas';

/** Mounted at `/me/push-token`. */
export const pushTokenRoutes = new Hono<AppBindings>();

pushTokenRoutes.use(requireAuth);

pushTokenRoutes.put('/', rateLimit('WRITE_LIMITER'), validate('json', pushTokenBodySchema), async (c) => {
  const body = c.req.valid('json');
  const token = await repo.upsert(getSupabase(c), currentUser(c).id, body.token, body.platform);
  return c.json({ token });
});

/** With a `token` removes that device; without one removes every token of the user. */
pushTokenRoutes.delete('/', rateLimit('WRITE_LIMITER'), validate('json', pushTokenDeleteBodySchema), async (c) => {
  const { token } = c.req.valid('json');
  const db = getSupabase(c);
  const userId = currentUser(c).id;
  if (token) await repo.deleteToken(db, userId, token);
  else await repo.deleteAllForUser(db, userId);
  return c.body(null, 204);
});
