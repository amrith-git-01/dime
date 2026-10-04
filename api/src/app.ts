import { Hono } from 'hono';

import { corsFromEnv } from './core/cors';
import type { AppBindings } from './core/env';
import { notFound, onError } from './core/errors';
import { requestId } from './core/request-id';
import { agentRoutes } from './features/agent/routes';
import { budgetRoutes } from './features/budgets/routes';
import { categoriesRoutes } from './features/categories/routes';
import { emailRoutes } from './features/email/routes';
import { healthRoutes } from './features/health/routes';
import { ingestRoutes } from './features/ingest/routes';
import { notificationsRoutes } from './features/notifications/routes';
import { profileAvatarRoutes } from './features/profile-avatar/routes';
import { pushTokenRoutes } from './features/push-tokens/routes';
import { transactionRoutes } from './features/transactions/routes';
import { userFeedbackRoutes } from './features/user-feedback/routes';
import { userProfileRoutes } from './features/user-profile/routes';
import { userSettingsRoutes } from './features/user-settings/routes';

export function createApp() {
  const app = new Hono<AppBindings>();

  // Order matters: request id first so every response (CORS preflights, errors, 404s) carries it.
  app.use(requestId);
  app.use(corsFromEnv);
  app.onError(onError);
  app.notFound(notFound);

  app.get('/', (c) => c.json({ message: 'Dime API', docs: '/docs', openapi: '/openapi.json' }));

  // Python served the email images at /static/email; they live at /email/* now (Workers Static Assets).
  // Old emails that point at the old path keep working through this redirect.
  app.get('/static/email/*', (c) => c.redirect(`/email/${c.req.path.slice('/static/email/'.length)}`, 301));

  // One router per feature, mounted under /api/v1. Add new features here.
  const api = app.basePath('/api/v1');
  api.route('/health', healthRoutes);
  api.route('/me', userProfileRoutes);
  api.route('/me/settings', userSettingsRoutes);
  api.route('/me/push-token', pushTokenRoutes);
  api.route('/profile', profileAvatarRoutes);
  api.route('/categories', categoriesRoutes);
  api.route('/budget', budgetRoutes);
  api.route('/notifications', notificationsRoutes);
  api.route('/transactions', transactionRoutes);
  api.route('/transactions', ingestRoutes); // receipt / voice / sms capture (R3)
  api.route('/feedback', userFeedbackRoutes);
  api.route('/agent', agentRoutes);
  api.route('/', emailRoutes); // /email/unsubscribe (signed link) and /internal/email/run (cron secret)

  return app;
}

export const app = createApp();
