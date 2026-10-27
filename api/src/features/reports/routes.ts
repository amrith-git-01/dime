import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import { getDb } from '../../core/db';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { validate } from '../../core/validation';
import { periodParamSchema } from './schemas';
import * as service from './service';

/** Mounted at `/reports`. */
export const reportsRoutes = new Hono<AppBindings>();

reportsRoutes.use(requireAuth);

reportsRoutes.get('/', async (c) => c.json(await service.listReports(getDb(c), currentUser(c).id, Date.now())));

reportsRoutes.get('/:period', validate('param', periodParamSchema), async (c) =>
  c.json(await service.getReport(getDb(c), currentUser(c).id, c.req.valid('param').period)),
);

reportsRoutes.post('/:period/viewed', rateLimit('WRITE_LIMITER'), validate('param', periodParamSchema), async (c) => {
  await service.markViewed(getDb(c), currentUser(c).id, c.req.valid('param').period);
  return c.body(null, 204);
});
