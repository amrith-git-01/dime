import { createMiddleware } from 'hono/factory';

import type { AppBindings } from './env';
import { TooManyRequestsError } from './errors';
import { log } from './logging';

/** Names of the `ratelimits` bindings in wrangler.jsonc. */
export type LimiterName = 'WRITE_LIMITER' | 'AI_LIMITER';

/**
 * Rate limit using a Workers rate-limiting binding (per Cloudflare location, eventually consistent:
 * a cost guard, not an exact quota). Keyed by user id, falling back to client IP. Mount it AFTER
 * `requireAuth` so the user id is available. No-op when the binding is absent (tests, local dev),
 * and fails open if the binding itself errors.
 */
export const rateLimit = (name: LimiterName) =>
  createMiddleware<AppBindings>(async (c, next) => {
    const limiter = c.env[name] as RateLimit | undefined;
    if (limiter) {
      const key = c.get('user')?.id ?? c.req.header('CF-Connecting-IP') ?? 'anonymous';
      let allowed = true;
      try {
        ({ success: allowed } = await limiter.limit({ key }));
      } catch (err) {
        log.warn('rate_limit_unavailable', { limiter: name, err: String(err) });
      }
      if (!allowed) throw new TooManyRequestsError();
    }
    await next();
  });
