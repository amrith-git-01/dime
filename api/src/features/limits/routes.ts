import { Hono } from 'hono';
import { currentUser, requireAuth } from '../../core/auth';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { getDb } from '../../core/db';
import { resolveUserTimezone } from '../user-settings/service';
import { dailyLimits } from './service';

/** Mounted at `/limits`: what the user has used today of each daily limit. */
export const limitsRoutes = new Hono<AppBindings>();

limitsRoutes.use(requireAuth);

limitsRoutes.get('/', async (c) => {
  const { workersAi, agent } = getConfig(c.env);
  const db = getDb(c);
  const userId = currentUser(c).id;
  return c.json(
    await dailyLimits(
      db,
      userId,
      { dailyNeuronCap: workersAi.dailyNeuronCap, userDailyReceipts: workersAi.userDailyReceipts, userDailyVoice: workersAi.userDailyVoice },
      agent.dailyQuestions,
      Date.now(),
      await resolveUserTimezone(db, userId, c.req.query('timezone')),
    ),
  );
});
