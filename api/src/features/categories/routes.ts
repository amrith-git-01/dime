import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { getDb } from '../../core/db';
import { validate } from '../../core/validation';
import { requestPublisher } from '../realtime/publish';
import { createCategorySchema, deleteQuerySchema, updateCategorySchema } from './schemas';
import * as service from './service';

/** Mounted at `/categories`. */
export const categoriesRoutes = new Hono<AppBindings>();

categoriesRoutes.use(requireAuth);

categoriesRoutes.get('/', async (c) => c.json(await service.listCategories(getDb(c), currentUser(c).id)));

categoriesRoutes.post('/', rateLimit('WRITE_LIMITER'), validate('json', createCategorySchema), async (c) =>
  c.json(await service.createCategory(getDb(c), currentUser(c).id, c.req.valid('json'), requestPublisher(c, currentUser(c).id)), 201),
);

categoriesRoutes.patch('/:id', rateLimit('WRITE_LIMITER'), validate('json', updateCategorySchema), async (c) =>
  c.json(await service.updateCategory(getDb(c), currentUser(c).id, c.req.param('id'), c.req.valid('json'), requestPublisher(c, currentUser(c).id))),
);

categoriesRoutes.get('/:id/delete-impact', async (c) =>
  c.json(await service.getDeleteImpact(getDb(c), currentUser(c).id, c.req.param('id'))),
);

categoriesRoutes.delete('/:id', rateLimit('WRITE_LIMITER'), validate('query', deleteQuerySchema), async (c) => {
  await service.deleteCategory(
    getDb(c),
    currentUser(c).id,
    c.req.param('id'),
    c.req.valid('query').reassign_to_category_id,
    requestPublisher(c, currentUser(c).id),
  );
  return c.body(null, 204);
});
