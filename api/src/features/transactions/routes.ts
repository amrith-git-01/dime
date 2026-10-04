import { Hono } from 'hono';
import type { Context } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import { defer } from '../../core/background';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { getSupabase } from '../../core/supabase';
import { parseTimezone } from '../../core/timezone';
import { validate } from '../../core/validation';
import { monthInsights } from '../insights/service';
import { IDEMPOTENCY_KEY_HEADER, parseIdempotencyKey, runIdempotent } from '../jobs/idempotency';
import { notifyAfterInsert } from '../notifications/after-insert';
import { idParamSchema, listQuerySchema, monthQuerySchema, timezoneQuerySchema, transactionWriteSchema } from './schemas';
import * as service from './service';
import type { TxContext } from './service';

/** Mounted at `/transactions`. R3 adds the receipt / voice / sms upload endpoints to this router. */
export const transactionRoutes = new Hono<AppBindings>();

transactionRoutes.use(requireAuth);

/** DB client, user and media-signing config for one request. */
export function txContext(c: Context<AppBindings>): TxContext {
  const config = getConfig(c.env);
  return {
    db: getSupabase(c),
    userId: currentUser(c).id,
    media: { defaultBucket: config.privateStorageBucket, expiresIn: config.signedUrlTtlSeconds },
  };
}

// Fixed paths first: `/:id` must not swallow them.
transactionRoutes.get('/home', validate('query', timezoneQuerySchema), async (c) =>
  c.json(await service.homeOverview(txContext(c), c.req.valid('query').timezone)),
);

transactionRoutes.get('/month-summary', validate('query', monthQuerySchema), async (c) =>
  c.json(await service.monthSummary(txContext(c), c.req.valid('query'))),
);

transactionRoutes.get('/month-insights', validate('query', monthQuerySchema), async (c) =>
  c.json(await monthInsights(txContext(c), c.req.valid('query'))),
);

transactionRoutes.get('/', validate('query', listQuerySchema), async (c) =>
  c.json(await service.listTransactions(txContext(c), c.req.valid('query'))),
);

transactionRoutes.get('/:id', validate('param', idParamSchema), async (c) =>
  c.json(await service.getTransaction(txContext(c), c.req.valid('param').id)),
);

/**
 * Manual entry needs no AI processing: insert synchronously so the client can refetch right after
 * the 201. Budget checks, notifications and push depend on nothing in the response, so they run in
 * the background (`waitUntil`) once the row is written.
 */
transactionRoutes.post(
  '/',
  rateLimit('WRITE_LIMITER'),
  validate('query', timezoneQuerySchema),
  validate('json', transactionWriteSchema),
  async (c) => {
    const timezone = parseTimezone(c.req.valid('query').timezone);
    const body = c.req.valid('json');
    const key = parseIdempotencyKey(c.req.header(IDEMPOTENCY_KEY_HEADER));
    const ctx = txContext(c);

    const create = async () => {
      const result = await service.createManual(ctx, body);
      if (result.kind === 'created' && body.type === 'debit') {
        defer(
          c,
          notifyAfterInsert(ctx.db, {
            userId: ctx.userId,
            timezone,
            transactionId: result.id,
            type: body.type,
            detectedVia: 'manual',
            transactionAtMs: body.transaction_at.ms,
            categoryId: result.categoryId,
            amount: body.amount,
            counterpartyName: body.counterparty_name,
          }),
          'manual_create_notifications',
        );
      }
      return { accepted: true };
    };

    if (key === null) return c.json(await create(), 201);
    const { status, body: replyBody } = await runIdempotent(ctx.db, {
      userId: ctx.userId,
      key,
      kind: 'manual_create',
      action: create,
      statusCode: 201,
      fallbackBody: { accepted: true },
    });
    return c.json(replyBody, status as 201);
  },
);

transactionRoutes.patch(
  '/:id',
  rateLimit('WRITE_LIMITER'),
  validate('param', idParamSchema),
  validate('json', transactionWriteSchema),
  async (c) => c.json(await service.updateTransaction(txContext(c), c.req.valid('param').id, c.req.valid('json'))),
);

transactionRoutes.delete('/:id', rateLimit('WRITE_LIMITER'), validate('param', idParamSchema), async (c) => {
  await service.deleteTransaction(txContext(c), c.req.valid('param').id);
  return c.body(null, 204);
});
