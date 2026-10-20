import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import { getDb } from '../../core/db';
import type { AppBindings } from '../../core/env';
import { validate } from '../../core/validation';
import { searchQuerySchema, suggestionsQuerySchema } from './schemas';
import * as service from './service';

/** Mounted at `/brands`: the shared catalogue behind the counterparty search box. */
export const brandsRoutes = new Hono<AppBindings>();

brandsRoutes.use(requireAuth);

brandsRoutes.get('/search', validate('query', searchQuerySchema), async (c) => {
  const { q, limit } = c.req.valid('query');
  return c.json(await service.searchBrands(getDb(c), q, limit));
});

/** Mounted at `/payees`: a user's own payees (from their transactions), for the same search box. */
export const payeesRoutes = new Hono<AppBindings>();

payeesRoutes.use(requireAuth);

payeesRoutes.get('/suggestions', validate('query', suggestionsQuerySchema), async (c) => {
  const { type, q, limit } = c.req.valid('query');
  return c.json(await service.payeeSuggestions(getDb(c), currentUser(c).id, { type, q, limit }));
});
