import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { getDb } from '../../core/db';
import { validate } from '../../core/validation';
import { settingsPatchSchema } from './schemas';
import * as service from './service';

/** Mounted at `/me/settings`. */
export const userSettingsRoutes = new Hono<AppBindings>();

userSettingsRoutes.use(requireAuth);

userSettingsRoutes.get('/', async (c) => c.json(await service.getOrCreate(getDb(c), currentUser(c).id)));

userSettingsRoutes.patch('/', rateLimit('WRITE_LIMITER'), validate('json', settingsPatchSchema), async (c) =>
  c.json(await service.patch(getDb(c), currentUser(c).id, c.req.valid('json'))),
);
