import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import { getDb } from '../../core/db';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { validate } from '../../core/validation';
import { reminderCompleteSchema, reminderCreateSchema, reminderIdParamSchema, reminderListQuerySchema, reminderPatchSchema } from './schemas';
import * as service from './service';

/** Mounted at `/reminders`: money to pay or receive. The cron (`sender.ts`) sends the notifications. */
export const remindersRoutes = new Hono<AppBindings>();

remindersRoutes.use(requireAuth);

remindersRoutes.get('/', validate('query', reminderListQuerySchema), async (c) =>
  c.json(await service.listReminders(getDb(c), currentUser(c).id, c.req.valid('query'))),
);

remindersRoutes.post('/', rateLimit('WRITE_LIMITER'), validate('json', reminderCreateSchema), async (c) =>
  c.json(await service.createReminder(getDb(c), currentUser(c).id, c.req.valid('json')), 201),
);

remindersRoutes.patch('/:id', rateLimit('WRITE_LIMITER'), validate('param', reminderIdParamSchema), validate('json', reminderPatchSchema), async (c) =>
  c.json(await service.updateReminder(getDb(c), currentUser(c).id, c.req.valid('param').id, c.req.valid('json'))),
);

remindersRoutes.delete('/:id', rateLimit('WRITE_LIMITER'), validate('param', reminderIdParamSchema), async (c) => {
  await service.deleteReminder(getDb(c), currentUser(c).id, c.req.valid('param').id);
  return c.body(null, 204);
});

remindersRoutes.post('/:id/complete', rateLimit('WRITE_LIMITER'), validate('param', reminderIdParamSchema), validate('json', reminderCompleteSchema), async (c) =>
  c.json(await service.completeReminder(getDb(c), currentUser(c).id, c.req.valid('param').id, c.req.valid('json'))),
);

remindersRoutes.post('/:id/skip', rateLimit('WRITE_LIMITER'), validate('param', reminderIdParamSchema), async (c) =>
  c.json(await service.skipReminder(getDb(c), currentUser(c).id, c.req.valid('param').id)),
);
