import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import type { AppBindings } from '../../core/env';
import { getDb } from '../../core/db';
import { onboardingProgress } from './service';

/** Mounted at `/me/onboarding-progress`: which "Get started" items the user has done, computed from their data. */
export const onboardingRoutes = new Hono<AppBindings>();

onboardingRoutes.use(requireAuth);

onboardingRoutes.get('/', async (c) => c.json(await onboardingProgress(getDb(c), currentUser(c).id)));
