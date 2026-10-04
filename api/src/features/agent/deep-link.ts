import { deepLinkSchema } from './schemas';
import type { DeepLink } from './schemas';

/** Python `model_dump(exclude_none=True)`: drop null/undefined keys (shallow, per object). */
const excludeNone = (obj: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));

/** A sanitized TransactionsList deep link (`exclude_none` dump), or null when the payload is invalid. */
export function validateDeepLink(raw: unknown): DeepLink | null {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const parsed = deepLinkSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { screen, label, params } = parsed.data;
  return excludeNone({ screen, label, params: excludeNone(params) });
}
