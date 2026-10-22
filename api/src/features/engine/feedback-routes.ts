import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import { getDb } from '../../core/db';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { validate } from '../../core/validation';
import { applyFeedback } from './feedback';
import { feedbackRequestSchema } from './schemas';

/** Mounted at `/predictions`. */
export const predictionRoutes = new Hono<AppBindings>();

predictionRoutes.use(requireAuth);

/** The user's answer to a prediction (confirm, dismiss, "one-off" or not). 204; the app refetches the forecast. */
predictionRoutes.post('/feedback', rateLimit('WRITE_LIMITER'), validate('json', feedbackRequestSchema), async (c) => {
  await applyFeedback(getDb(c), currentUser(c).id, c.req.valid('json'));
  return c.body(null, 204);
});
