import { Hono } from 'hono';

import type { AppBindings } from '../../core/env';

export const healthRoutes = new Hono<AppBindings>().get('/', (c) => c.json({ status: 'ok' }));
