import { Hono } from 'hono';
import type { Context } from 'hono';
import { currentUser, requireAuth } from '../../core/auth';
import { decimalToCents } from '../../core/decimal';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { getDb } from '../../core/db';
import { log } from '../../core/logging';
import { parseTimezone } from '../../core/timezone';
import { unprocessable, validate } from '../../core/validation';
import { monthInsights } from '../insights/service';
import { IDEMPOTENCY_KEY_HEADER, parseIdempotencyKey, runIdempotent } from '../jobs/idempotency';
import { mediaStore } from '../media/storage';
import { deferBudgetAlerts } from '../notifications/budget-alerts';
import { requestPublisher } from '../realtime/publish';
import { findRecurringMatch } from '../recurring/match';
import type { PossibleRecurring } from '../recurring/match';
import { normalizedOrNull, payeeKey } from './dedupe';
import { createOffset, deleteOffset, listOffsets, offsetCreateSchema, paybackCandidates } from './offsets';
import { expectedUpdatedAtSchema, idParamSchema, listQuerySchema, monthQuerySchema, timezoneQuerySchema, transactionPatchSchema, transactionWriteSchema } from './schemas';
import type { Instant, TransactionResponse } from './schemas';
import * as service from './service';
import type { TxContext } from './service';

/** Mounted at `/transactions`. R3 adds the receipt / voice / sms upload endpoints to this router. */
export const transactionRoutes = new Hono<AppBindings>();

transactionRoutes.use(requireAuth);

/**
 * DB, media store, user and media-signing config for one request. A write that can move a month's spend re-checks that month's
 * budget alerts in the background (`afterWrite`); `timezone` is the request's own, used when the user stored none.
 */
function txContext(c: Context<AppBindings>, timezone?: string): TxContext {
  const config = getConfig(c.env);
  const userId = currentUser(c).id;
  const db = getDb(c);
  const publish = requestPublisher(c, userId);
  return {
    db,
    storage: mediaStore(c.env),
    userId,
    media: { expiresIn: config.signedUrlTtlSeconds },
    publish,
    afterWrite: deferBudgetAlerts(c, db, userId, publish, timezone),
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

/** Paybacks: link (part of) a credit to the debit it pays back. */
transactionRoutes.post('/offsets', rateLimit('WRITE_LIMITER'), validate('json', offsetCreateSchema), async (c) =>
  c.json(await createOffset(txContext(c), c.req.valid('json')), 201),
);

transactionRoutes.delete('/offsets/:id', rateLimit('WRITE_LIMITER'), validate('param', idParamSchema), async (c) => {
  await deleteOffset(txContext(c), c.req.valid('param').id);
  return c.body(null, 204);
});

transactionRoutes.get('/', validate('query', listQuerySchema), async (c) =>
  c.json(await service.listTransactions(txContext(c), c.req.valid('query'))),
);

transactionRoutes.get('/:id', validate('param', idParamSchema), async (c) =>
  c.json(await service.getTransaction(txContext(c), c.req.valid('param').id)),
);

transactionRoutes.get('/:id/offsets', validate('param', idParamSchema), async (c) =>
  c.json(await listOffsets(txContext(c), c.req.valid('param').id)),
);

transactionRoutes.get('/:id/payback-candidates', validate('param', idParamSchema), async (c) =>
  c.json(await paybackCandidates(txContext(c), c.req.valid('param').id)),
);

/**
 * Manual entry needs no AI processing: insert synchronously so the client can refetch right after the 201. The budget alerts
 * depend on nothing in the response, so they run in the background (`waitUntil`) once the row is written. A manual entry is
 * never merged into another: when it looks like one already there the response says so (`possible_duplicate_of`), and when it
 * looks like a recurring item's occurrence it says that (`possible_recurring`), so the app can offer "Undo / keep" and "Link".
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
    const ctx = txContext(c, timezone);

    const create = async (): Promise<{
      accepted: true;
      id?: string;
      created?: boolean;
      transaction?: TransactionResponse;
      possible_duplicate_of?: string;
      possible_recurring?: PossibleRecurring;
    }> => {
      const result = await service.createManual(ctx, body, timezone);
      // The id lets a client undo its own add (widgets) without listing; `created: false` says the request resolved to a row
      // that already existed, so it is not the client's to undo. Idempotent replays return this body.
      // `transaction` is the saved row (list-item shape) so the app can patch its caches without a refetch; replays of
      // bodies stored before it existed simply lack it.
      const transaction = await service.getTransactionOrNull(ctx, result.id).catch((err: unknown) => {
        log.warn('manual_create_row_read_failed', { err, id: result.id }); // the row is saved; the app refetches
        return null;
      });
      if (result.kind !== 'created') return { accepted: true, id: result.id, created: false, ...(transaction ? { transaction } : {}) };
      const possibleRecurring = await findRecurringMatch(ctx.db, ctx.userId, {
        type: body.type,
        amountCents: decimalToCents(body.amount),
        payeeKey: payeeKey(normalizedOrNull(body.counterparty_name), body.counterparty_name),
        localDate: result.localDate,
      }).catch((err: unknown) => {
        log.warn('possible_recurring_failed', { err, id: result.id }); // a hint only
        return null;
      });
      return {
        accepted: true,
        id: result.id,
        created: true,
        ...(transaction ? { transaction } : {}),
        ...(result.possibleDuplicateOf ? { possible_duplicate_of: result.possibleDuplicateOf } : {}),
        ...(possibleRecurring ? { possible_recurring: possibleRecurring } : {}),
      };
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

/**
 * Only the fields sent change. `expected_updated_at` (the `updated_at` the client last saw) makes a row that changed elsewhere
 * meanwhile a 409 `{code: 'stale'}` instead of an overwrite.
 */
transactionRoutes.patch(
  '/:id',
  rateLimit('WRITE_LIMITER'),
  validate('param', idParamSchema),
  validate('json', transactionPatchSchema),
  async (c) => c.json(await service.updateTransaction(txContext(c), c.req.valid('param').id, c.req.valid('json'))),
);

/** The optional staleness guard of a DELETE: the `expected_updated_at` query parameter, or the same key in a JSON body. */
async function deleteGuard(c: Context<AppBindings>): Promise<Instant | undefined> {
  const raw: unknown = c.req.query('expected_updated_at') !== undefined ? { expected_updated_at: c.req.query('expected_updated_at') } : await c.req.json().catch(() => ({}));
  const parsed = expectedUpdatedAtSchema.safeParse(typeof raw === 'object' && raw !== null ? raw : {});
  if (!parsed.success) unprocessable([{ type: 'datetime_parsing', loc: ['body', 'expected_updated_at'], msg: 'Input should be a valid datetime' }]);
  return parsed.data.expected_updated_at;
}

transactionRoutes.delete('/:id', rateLimit('WRITE_LIMITER'), validate('param', idParamSchema), async (c) => {
  await service.deleteTransaction(txContext(c), c.req.valid('param').id, await deleteGuard(c));
  return c.body(null, 204);
});

/** The app's undo of a delete: the row comes back, with its paybacks, and the budget alerts of its months are re-checked. */
transactionRoutes.post('/:id/restore', rateLimit('WRITE_LIMITER'), validate('param', idParamSchema), async (c) =>
  c.json(await service.restoreTransaction(txContext(c), c.req.valid('param').id)),
);
