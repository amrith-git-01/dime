/**
 * Payee normalisation. (Duplicate detection is a suggestion made by the service from the row's own columns, see
 * `repository.findPossibleDuplicate`; idempotency identities are `job:<id>` and the recurring occurrence.)
 */

/** lower-case, runs of anything but a letter, a combining mark or a digit (any script) become one space, trimmed: Tamil and Hindi names keep their vowel signs. */
export function normalizeCounterparty(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalized payee for storage: null when no letter or digit is left. */
export function normalizedOrNull(raw: string): string | null {
  return normalizeCounterparty(raw) || null;
}

/**
 * Group key of a payee, computed on write into `transactions.payee_key`. The rule: the stored normalized value when non-empty, else the normalized name, else
 * "unknown".
 */
export function payeeKey(normalized: string | null | undefined, name: string | null | undefined): string {
  const stored = (normalized ?? '').trim();
  if (stored) return stored;
  return normalizeCounterparty(name ?? '') || 'unknown';
}
