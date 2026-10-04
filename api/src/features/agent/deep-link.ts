import { parseIsoDate } from './dates';
import { deepLinkSchema, excludeNone } from './schemas';
import type { DeepLink } from './schemas';
import { extractSqlEntities } from './sql-entities';
import type { SqlResultLike } from './sql-entities';
import { spansMultipleCalendarMonths } from './time-range';
import type { PackedRange, TimeRange } from './time-range';

/** Validate and enrich LLM-generated TransactionsList deep links (port of `deep_link.py`). */

/** A sanitized deep link (`exclude_none` dump), or null when the model's output is invalid. */
export function validateDeepLink(raw: unknown): DeepLink | null {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const parsed = deepLinkSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { screen, label, params } = parsed.data;
  return excludeNone({ screen, label, params: excludeNone(params as Record<string, unknown>) });
}

/** Attach fromIso/toIso for multi-month windows so TransactionsList loads the whole range. */
export function enrichDeepLink(link: unknown, timeRange: TimeRange | null | undefined): DeepLink | null {
  const validated = validateDeepLink(link);
  if (validated === null) return null;
  if (!spansMultipleCalendarMonths(timeRange)) return validated;

  const params = validated['params'];
  if (typeof params !== 'object' || params === null) return validated;
  const filter = (params as Record<string, unknown>)['filter'];
  if (filter !== 'payee' && filter !== 'category') return validated;

  const range = timeRange as PackedRange;
  if (typeof range.start_iso !== 'string' || typeof range.end_iso !== 'string') return validated;

  const enriched: Record<string, unknown> = { ...params, fromIso: range.start_iso, toIso: range.end_iso };
  if (typeof range.end_date === 'string') {
    const end = parseIsoDate(range.end_date);
    enriched['year'] = end.year;
    enriched['monthIndex0'] = end.month - 1;
  }
  return validateDeepLink({ ...validated, params: enriched });
}

/**
 * Enrich the time range, then bind payee/category links to the exact ids in the SQL rows. Payee
 * links need exactly one `counterparty_normalized`, category links exactly one `category_id`;
 * otherwise the link is dropped (the model must never invent ids).
 */
export function resolveDeepLinkIds(
  link: unknown,
  ctx: { lastResult: SqlResultLike | null | undefined; timeRange: TimeRange | null | undefined },
): DeepLink | null {
  const enriched = enrichDeepLink(link, ctx.timeRange);
  if (enriched === null) return null;

  const params = enriched['params'];
  if (typeof params !== 'object' || params === null) return enriched;
  const filter = (params as Record<string, unknown>)['filter'];
  if (filter !== 'payee' && filter !== 'category') return enriched;

  const entities = extractSqlEntities(ctx.lastResult);
  if (filter === 'payee') {
    const payee = entities.payees.length === 1 ? entities.payees[0] : undefined;
    if (!payee) return null;
    const resolved: Record<string, unknown> = { ...params, payeeId: payee.payeeId, payeeKey: payee.payeeId };
    if (payee.displayName) resolved['payeeDisplayName'] = payee.displayName;
    return validateDeepLink({ ...enriched, params: resolved });
  }

  const category = entities.categories.length === 1 ? entities.categories[0] : undefined;
  if (!category) return null;
  const resolved: Record<string, unknown> = { ...params, categoryId: category.categoryId };
  if (category.displayName) resolved['categoryDisplayName'] = category.displayName;
  return validateDeepLink({ ...enriched, params: resolved });
}
