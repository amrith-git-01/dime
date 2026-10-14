import { Hono } from 'hono';
import type { Context } from 'hono';
import { currentUser, requireAuth } from '../../core/auth';
import { defer } from '../../core/background';
import { getDb } from '../../core/db';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { validate } from '../../core/validation';
import { mediaStore } from '../media/storage';
import { requestPublisher } from '../realtime/publish';
import type { TxContext } from '../transactions/service';
import { recurringCreateSchema, recurringIdParamSchema, recurringListQuerySchema, recurringMonthQuerySchema, recurringPatchSchema } from './schemas';
import * as service from './service';

/** Mounted at `/recurring`: recurring income (salary) and subscriptions. The cron (`poster.ts`) posts the transactions. */
export const recurringRoutes = new Hono<AppBindings>();

recurringRoutes.use(requireAuth);

/** Same context the transaction services use (a due posting is a normal transaction create). */
function txContext(c: Context<AppBindings>): TxContext {
  const userId = currentUser(c).id;
  return {
    db: getDb(c),
    storage: mediaStore(c.env),
    userId,
    media: { expiresIn: getConfig(c.env).signedUrlTtlSeconds },
    publish: requestPublisher(c, userId),
  };
}

recurringRoutes.get('/', validate('query', recurringListQuerySchema), async (c) =>
  c.json(await service.listRecurring(txContext(c), c.req.valid('query').kind)),
);

/** Paid / upcoming / skipped occurrences of the recurring items in one calendar month (each in its own timezone). */
recurringRoutes.get('/month', validate('query', recurringMonthQuerySchema), async (c) => {
  const { year, month } = c.req.valid('query');
  return c.json(await service.monthOccurrences(txContext(c), year, month));
});

recurringRoutes.post('/', rateLimit('WRITE_LIMITER'), validate('json', recurringCreateSchema), async (c) =>
  c.json(await service.createRecurring(txContext(c), c.req.valid('json'), (work) => defer(c, work, 'recurring_create_notifications')), 201),
);

recurringRoutes.patch('/:id', rateLimit('WRITE_LIMITER'), validate('param', recurringIdParamSchema), validate('json', recurringPatchSchema), async (c) =>
  c.json(await service.updateRecurring(txContext(c), c.req.valid('param').id, c.req.valid('json'))),
);

recurringRoutes.delete('/:id', rateLimit('WRITE_LIMITER'), validate('param', recurringIdParamSchema), async (c) => {
  await service.deleteRecurring(txContext(c), c.req.valid('param').id);
  return c.body(null, 204);
});
