import { Hono } from 'hono';
import { currentUser, requireAuth } from '../../core/auth';
import { getDb } from '../../core/db';
import type { AppBindings } from '../../core/env';
import { validate } from '../../core/validation';
import { monthQuerySchema } from '../transactions/schemas';
import { loadAccuracy } from './scoring';
import { getForecast } from './service';

/** Mounted at `/forecast`. */
export const forecastRoutes = new Hono<AppBindings>();

forecastRoutes.use(requireAuth);

/** The month's forecast: landing range, safe to spend today, categories ahead, coming up and watch (current month), or the actuals (past month). */
forecastRoutes.get('/', validate('query', monthQuerySchema), async (c) =>
  c.json(await getForecast(getDb(c), currentUser(c).id, c.req.valid('query'))),
);

/** How the last three scored months' forecasts did: the error of the middle of the range, and whether the actual landed inside it. */
forecastRoutes.get('/accuracy', async (c) => c.json({ months: await loadAccuracy(getDb(c), currentUser(c).id) }));
