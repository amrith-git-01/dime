import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { getDb } from '../../core/db';
import { validate } from '../../core/validation';
import { budgetUpsertSchema, categoryBudgetUpsertSchema } from './schemas';
import * as service from './service';

/** Mounted at `/budget`. */
export const budgetRoutes = new Hono<AppBindings>();

budgetRoutes.use(requireAuth);

budgetRoutes.get('/', async (c) => c.json(await service.getBudget(getDb(c), currentUser(c).id)));

budgetRoutes.patch('/', rateLimit('WRITE_LIMITER'), validate('json', budgetUpsertSchema), async (c) =>
  c.json(await service.upsertBudget(getDb(c), currentUser(c).id, c.req.valid('json'))),
);

budgetRoutes.get('/categories', async (c) => c.json(await service.listCategoryBudgets(getDb(c), currentUser(c).id)));

budgetRoutes.put(
  '/categories/:categoryId',
  rateLimit('WRITE_LIMITER'),
  validate('json', categoryBudgetUpsertSchema),
  async (c) =>
    c.json(
      await service.upsertCategoryBudget(
        getDb(c),
        currentUser(c).id,
        c.req.param('categoryId'),
        c.req.valid('json').monthly_amount,
      ),
    ),
);

budgetRoutes.delete('/categories/:categoryId', rateLimit('WRITE_LIMITER'), async (c) => {
  await service.deleteCategoryBudget(getDb(c), currentUser(c).id, c.req.param('categoryId'));
  return c.body(null, 204);
});
