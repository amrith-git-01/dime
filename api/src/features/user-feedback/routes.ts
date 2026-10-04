import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { getSupabase } from '../../core/supabase';
import { validate } from '../../core/validation';
import { feedbackBodySchema } from './schemas';
import { createFeedback } from './service';

/** Mounted at `/feedback`. */
export const userFeedbackRoutes = new Hono<AppBindings>();

userFeedbackRoutes.use(requireAuth);

userFeedbackRoutes.post('/', rateLimit('WRITE_LIMITER'), validate('json', feedbackBodySchema), async (c) => {
  const user = currentUser(c);
  return c.json(await createFeedback(getSupabase(c), user.id, c.req.valid('json'), user.email), 201);
});
