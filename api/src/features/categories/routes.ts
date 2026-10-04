import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { getSupabase } from '../../core/supabase';
import { validate } from '../../core/validation';
import { createCategorySchema, deleteQuerySchema, updateCategorySchema } from './schemas';
import * as service from './service';

/** Mounted at `/categories`. */
export const categoriesRoutes = new Hono<AppBindings>();

categoriesRoutes.use(requireAuth);

categoriesRoutes.get('/', async (c) => c.json(await service.listCategories(getSupabase(c), currentUser(c).id)));

categoriesRoutes.post('/', rateLimit('WRITE_LIMITER'), validate('json', createCategorySchema), async (c) =>
  c.json(await service.createCategory(getSupabase(c), currentUser(c).id, c.req.valid('json')), 201),
);

categoriesRoutes.patch('/:id', rateLimit('WRITE_LIMITER'), validate('json', updateCategorySchema), async (c) =>
  c.json(await service.updateCategory(getSupabase(c), currentUser(c).id, c.req.param('id'), c.req.valid('json'))),
);

categoriesRoutes.get('/:id/delete-impact', async (c) =>
  c.json(await service.getDeleteImpact(getSupabase(c), currentUser(c).id, c.req.param('id'))),
);

categoriesRoutes.delete('/:id', rateLimit('WRITE_LIMITER'), validate('query', deleteQuerySchema), async (c) => {
  await service.deleteCategory(
    getSupabase(c),
    currentUser(c).id,
    c.req.param('id'),
    c.req.valid('query').reassign_to_category_id,
  );
  return c.body(null, 204);
});
