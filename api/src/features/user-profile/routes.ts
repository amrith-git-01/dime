import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import { defer } from '../../core/background';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { getDb } from '../../core/db';
import { validate } from '../../core/validation';
import { createEmailService } from '../email/service';
import { profileUpdateBodySchema } from './schemas';
import * as service from './service';

/** Mounted at `/me`: `GET /me`, `PUT /me/profile`. */
export const userProfileRoutes = new Hono<AppBindings>();

userProfileRoutes.use(requireAuth);

userProfileRoutes.get('/', async (c) => {
  const db = getDb(c);
  const me = await service.getMe(db, currentUser(c), {
    email: createEmailService(c.env, db),
    background: (task, name) => {
      defer(c, task, name);
    },
  });
  return c.json(me);
});

userProfileRoutes.put('/profile', rateLimit('WRITE_LIMITER'), validate('json', profileUpdateBodySchema), async (c) => {
  const me = await service.updateProfile(getDb(c), currentUser(c), c.req.valid('json'));
  return c.json(me);
});
