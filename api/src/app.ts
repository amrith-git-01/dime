import { Hono } from 'hono';

import { limitJsonBody } from './core/body-limit';
import { noStore } from './core/cache-control';
import { corsFromEnv } from './core/cors';
import type { AppBindings } from './core/env';
import { notFound, onError } from './core/errors';
import { requestId } from './core/request-id';
import { agentRoutes } from './features/agent/routes';
import { authRoutes } from './features/auth/routes';
import { brandsRoutes, payeesRoutes } from './features/brands/routes';
import { budgetRoutes } from './features/budgets/routes';
import { categoriesRoutes } from './features/categories/routes';
import { emailRoutes } from './features/email/routes';
import { healthRoutes } from './features/health/routes';
import { ingestJobRoutes, ingestRoutes } from './features/ingest/routes';
import { limitsRoutes } from './features/limits/routes';
import { mediaRoutes } from './features/media/routes';
import { notificationsRoutes } from './features/notifications/routes';
import { onboardingRoutes } from './features/onboarding/routes';
import { profileAvatarRoutes } from './features/profile-avatar/routes';
import { realtimeRoutes } from './features/realtime/routes';
import { pushTokenRoutes } from './features/push-tokens/routes';
import { predictionRoutes } from './features/engine/feedback-routes';
import { forecastRoutes } from './features/engine/routes';
import { recurringRoutes } from './features/recurring/routes';
import { transactionRoutes } from './features/transactions/routes';
import { updatesRoutes } from './features/updates/routes';
import { userFeedbackRoutes } from './features/user-feedback/routes';
import { userProfileRoutes } from './features/user-profile/routes';
import { userSettingsRoutes } from './features/user-settings/routes';

export function createApp() {
  const app = new Hono<AppBindings>();

  // Order matters: request id first so every response (CORS preflights, errors, 404s) carries it.
  app.use(requestId);
  app.use('/api/v1/*', noStore);
  app.use('/api/v1/*', limitJsonBody);
  app.use(corsFromEnv);
  app.onError(onError);
  app.notFound(notFound);

  app.get('/', (c) => c.json({ message: 'Dime API' }));

  // Python served the email images at /static/email; they live at /email/* now (Workers Static Assets).
  // Old emails that point at the old path keep working through this redirect.
  app.get('/static/email/*', (c) => c.redirect(`/email/${c.req.path.slice('/static/email/'.length)}`, 301));

  // R2 media (public avatars, HMAC-signed receipts and voice). Not under /api/v1: no auth, its own cache headers.
  app.route('/media', mediaRoutes);

  // One router per feature, mounted under /api/v1. Add new features here.
  const api = app.basePath('/api/v1');
  api.route('/health', healthRoutes);
  api.route('/auth', authRoutes);
  api.route('/me', userProfileRoutes);
  api.route('/me/settings', userSettingsRoutes);
  api.route('/me/push-token', pushTokenRoutes);
  api.route('/me/onboarding-progress', onboardingRoutes); // Home "Get started" checklist
  api.route('/profile', profileAvatarRoutes);
  api.route('/categories', categoriesRoutes);
  api.route('/brands', brandsRoutes); // catalogue search for the counterparty box
  api.route('/payees', payeesRoutes); // the user's own payees (suggestions)
  api.route('/budget', budgetRoutes);
  api.route('/notifications', notificationsRoutes);
  api.route('/transactions', transactionRoutes);
  api.route('/transactions', ingestRoutes); // receipt / voice capture (R3)
  api.route('/ingest', ingestJobRoutes); // capture job status (polled by the Android widget card)
  api.route('/recurring', recurringRoutes);
  api.route('/forecast', forecastRoutes); // predictive engine: month-end range, safe to spend, coming up, watch
  api.route('/predictions', predictionRoutes); // feedback on the engine's predictions (confirm / dismiss)
  api.route('/limits', limitsRoutes);
  api.route('/feedback', userFeedbackRoutes);
  api.route('/agent', agentRoutes);
  api.route('/updates', updatesRoutes); // self-hosted expo-updates manifest + assets (public, signed offline)
  api.route('/realtime', realtimeRoutes); // WebSocket upgrade, forwarded to the user's UserHub
  api.route('/', emailRoutes); // /email/unsubscribe (signed link) and /internal/email/run (cron secret)

  return app;
}

export const app = createApp();
