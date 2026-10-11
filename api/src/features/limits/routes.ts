import { Hono } from 'hono';
import { currentUser, requireAuth } from '../../core/auth';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { getDb } from '../../core/db';
import { dailyLimits } from './service';

/** Mounted at `/limits`: what the user has used today of each daily limit. */
export const limitsRoutes = new Hono<AppBindings>();

limitsRoutes.use(requireAuth);

limitsRoutes.get('/', async (c) => {
  const { workersAi, agent } = getConfig(c.env);
  return c.json(
    await dailyLimits(
      getDb(c),
      currentUser(c).id,
      { dailyNeuronCap: workersAi.dailyNeuronCap, userDailyReceipts: workersAi.userDailyReceipts, userDailyVoice: workersAi.userDailyVoice },
      agent.dailyQuestions,
    ),
  );
});
