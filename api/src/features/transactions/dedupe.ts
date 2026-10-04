import { quantizeMoney } from '../../core/decimal';

/**
 * Transaction deduplication: `payment_hash` fingerprint + sparse merge. Port of backend
 * `features/transactions/dedupe.py`. The hash MUST stay byte-identical to Python's so rows hashed by
 * either backend dedupe against each other.
 */

const MERGEABLE_FIELDS = ['category_id', 'note', 'receipt_url', 'voice_url', 'counterparty_type'] as const;

/** lower-case, runs of non `[a-z0-9]` become one space, trimmed. */
export function normalizeCounterparty(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalized payee for storage: null when nothing alphanumeric is left. */
export function normalizedOrNull(raw: string): string | null {
  return normalizeCounterparty(raw) || null;
}

/** "199" -> "199.00" (half-even, like Decimal.quantize). */
export function formatAmountForHash(amount: string | number): string {
  return quantizeMoney(String(amount).trim());
}

/** UTC minute bucket "YYYY-MM-DDTHH:MM" for stable cross-source matching. */
export function transactionMinuteBucket(instantMs: number): string {
  return new Date(instantMs).toISOString().slice(0, 16);
}

/** Python `json.dumps` default (`ensure_ascii=True`) also escapes DEL and everything non-ASCII. */
function escapeNonAscii(json: string): string {
  return json.replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export interface PaymentHashInput {
  amount: string | number;
  type: string;
  counterpartyNormalized: string | null | undefined;
  counterpartyName: string;
  /** Epoch ms of the transaction instant. */
  transactionAtMs: number;
}

/** sha256 hex of the canonical JSON `{"amount","counterparty","minute","type"}` (sorted keys, compact). */
export async function buildPaymentHash(input: PaymentHashInput): Promise<string> {
  let counterparty = (input.counterpartyNormalized ?? '').trim();
  if (!counterparty) counterparty = normalizeCounterparty(input.counterpartyName);
  const canonical = escapeNonAscii(
    JSON.stringify({
      amount: formatAmountForHash(input.amount),
      counterparty,
      minute: transactionMinuteBucket(input.transactionAtMs),
      type: input.type,
    }),
  );
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

type Mergeable = (typeof MERGEABLE_FIELDS)[number];

/** Fill only the fields that are empty on the existing row from a re-ingested capture. */
export function buildSparseMergePatch(
  existing: Partial<Record<Mergeable, unknown>>,
  incoming: Partial<Record<Mergeable, unknown>>,
): Partial<Record<Mergeable, string>> {
  const patch: Partial<Record<Mergeable, string>> = {};
  for (const field of MERGEABLE_FIELDS) {
    if (existing[field]) continue;
    const value = incoming[field];
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    patch[field] = value as string;
  }
  return patch;
}
