import { parseIsoDate, wallIso } from './dates';
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

export interface LinkInput {
  tz: string;
  filter: 'payee' | 'category' | 'day';
  /** payee key, or category uuid (checked against the user's data before this is called). */
  id?: string;
  /** Display name from the database. */
  name?: string;
  /** Inclusive local dates (payee and category links). */
  from?: string;
  to?: string;
  /** Day link: the local date. */
  day?: string;
  label?: string;
}

/** The TransactionsList link for one payee, one category or one day (what the app opens), or null when it does not validate. */
export function buildTransactionsLink(input: LinkInput): DeepLink | null {
  if (input.filter === 'day') {
    const d = parseIsoDate(input.day ?? '');
    if (!d) return null;
    return validateDeepLink({ screen: 'TransactionsList', label: input.label || 'View this day', params: { filter: 'day', year: d.year, monthIndex0: d.month - 1, dayKey: input.day } });
  }
  const a = parseIsoDate(input.from ?? '');
  const b = parseIsoDate(input.to ?? '');
  if (!a || !b || !input.id || !input.name) return null;
  const common = { year: b.year, monthIndex0: b.month - 1 };
  const range = { fromIso: wallIso(input.tz, a, 0, 0, 0), toIso: wallIso(input.tz, b, 23, 59, 59, 999_999) };
  const label = input.label || `View ${input.name}`;
  return validateDeepLink(
    input.filter === 'payee'
      ? { screen: 'TransactionsList', label, params: { filter: 'payee', ...common, payeeId: input.id, payeeKey: input.id, payeeDisplayName: input.name, payeeKeysTop: [input.id], ...range } }
      : { screen: 'TransactionsList', label, params: { filter: 'category', ...common, categoryId: input.id, categoryDisplayName: input.name, ...range } },
  );
}
