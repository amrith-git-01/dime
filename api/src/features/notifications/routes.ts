import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { getSupabase } from '../../core/supabase';
import { validate } from '../../core/validation';
import { listQuerySchema, notificationIdParamSchema } from './schemas';
import * as service from './service';

/** Mounted at `/notifications`. */
export const notificationsRoutes = new Hono<AppBindings>();

notificationsRoutes.use(requireAuth);

notificationsRoutes.get('/', validate('query', listQuerySchema), async (c) =>
  c.json(await service.listInbox(getSupabase(c), currentUser(c).id, c.req.valid('query'))),
);

notificationsRoutes.get('/unread-count', async (c) => c.json(await service.unreadCount(getSupabase(c), currentUser(c).id)));

notificationsRoutes.patch('/:id/read', rateLimit('WRITE_LIMITER'), validate('param', notificationIdParamSchema), async (c) =>
  c.json(await service.markRead(getSupabase(c), currentUser(c).id, c.req.valid('param').id)),
);

notificationsRoutes.delete('/:id', rateLimit('WRITE_LIMITER'), validate('param', notificationIdParamSchema), async (c) => {
  await service.remove(getSupabase(c), currentUser(c).id, c.req.valid('param').id);
  return c.body(null, 204);
});
