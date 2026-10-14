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

// ponytail: installed 1.0.0 app builds still read the removed daily-budget keys; answer them as
// 'off' until those builds are gone, then drop this (and the DB columns).
const withLegacyKeys = <T extends object>(settings: T) => ({ ...settings, budget_daily_alerts_enabled: false, budget_daily_warn_pct: 80 });

userSettingsRoutes.get('/', async (c) => c.json(withLegacyKeys(await service.getOrCreate(getDb(c), currentUser(c).id))));

userSettingsRoutes.patch('/', rateLimit('WRITE_LIMITER'), validate('json', settingsPatchSchema), async (c) =>
  c.json(withLegacyKeys(await service.patch(getDb(c), currentUser(c).id, c.req.valid('json')))),
);
