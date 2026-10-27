import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import * as z from 'zod';

import { safeEqual } from '../../core/crypto';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { BadRequestError, UnauthorizedError } from '../../core/errors';
import { getDb } from '../../core/db';
import { unprocessable, validate } from '../../core/validation';
import { fanOutReports } from '../reports/fanout';
import { isPastMonth, parsePeriodKey } from '../reports/service';
import { fanOutDigest } from './digest';
import { renderUnsubscribedHtml } from './html';
import { unsubscribe } from './service';

/**
 * Mounted at the API root (`/api/v1`): `GET /email/unsubscribe` (token link from the emails, no auth)
 * and `POST /internal/email/run` (cron secret). Paths are the Python ones, so links in emails that
 * were already sent keep working.
 */
export const emailRoutes = new Hono<AppBindings>();

const unsubscribeQuerySchema = z.object({ token: z.string().min(8) });

emailRoutes.get('/email/unsubscribe', validate('query', unsubscribeQuerySchema), async (c) => {
  const kind = await unsubscribe(getDb(c), getConfig(c.env), c.req.valid('query').token);
  if (!kind) throw new BadRequestError('Invalid unsubscribe link.');
  return c.html(renderUnsubscribedHtml(kind));
});

/** `X-Email-Cron-Secret` must equal `EMAIL_CRON_SECRET` (constant-time); rejected outright when the secret is unset. */
const requireCronSecret = createMiddleware<AppBindings>(async (c, next) => {
  const expected = getConfig(c.env).email.cronSecret;
  const given = c.req.header('X-Email-Cron-Secret');
  if (!expected || !given || !(await safeEqual(given, expected))) throw new UnauthorizedError('Unauthorized.');
  await next();
});

const runBodySchema = z.object({ kind: z.enum(['weekly', 'monthly']) });

/**
 * Enqueue a digest run now (same messages the cron produces; `email_sends` keeps each user's email
 * once per period). `sent` is the number of emails queued, not delivered: delivery is asynchronous.
 */
emailRoutes.post('/internal/email/run', requireCronSecret, validate('json', runBodySchema), async (c) => {
  const result = await fanOutDigest({
    db: getDb(c),
    queue: c.env.EMAIL_QUEUE,
    config: getConfig(c.env),
    kind: c.req.valid('json').kind,
    nowMs: Date.now(),
  });
  return c.json({ sent: result.queued, queued: result.queued });
});

const reportsRunBodySchema = z.object({ period_key: z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/).optional() });

/**
 * Re-run the Broke Report fan-out now: the previous IST month, or the finished month named by an optional `period_key`.
 * Same messages and selection as the cron (users with 5+ debits and no stored report yet), so it is safe to repeat.
 * `queued` counts messages put on the queue, not reports built: the consumer builds them asynchronously.
 */
emailRoutes.post('/internal/reports/run', requireCronSecret, async (c) => {
  // The body is optional: no body (or an empty one) means "the previous month".
  const raw: unknown = await c.req.json().catch(() => ({}));
  const parsed = reportsRunBodySchema.safeParse(raw ?? {});
  if (!parsed.success) unprocessable([{ type: 'string_pattern_mismatch', loc: ['body', 'period_key'], msg: 'period_key must be YYYY-MM' }]);
  const periodKey = parsed.data.period_key;
  const ym = periodKey ? parsePeriodKey(periodKey) : null;
  if (periodKey && (!ym || !isPastMonth(ym, Date.now()))) throw new BadRequestError('period_key must be a finished month.');
  const result = await fanOutReports({ db: getDb(c), queue: c.env.EMAIL_QUEUE, nowMs: Date.now(), periodKey });
  return c.json({ period_key: result.periodKey, selected: result.selected, queued: result.queued, failed: result.failed });
});
