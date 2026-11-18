import type { TransactionKind, TransactionType } from './schemas';

/**
 * Deterministic `kind` inference for manual entries (the user is never shown a kind picker): the payee name and the note are
 * read for the few phrases that change how money counts. A capture gets its kind from the AI parse instead (no extra call).
 * Returns null when nothing is recognised, so the default for the direction applies.
 */

/** Own account / self transfer: money that stays with the user. */
const OWN_ACCOUNT = /\b(self[\s-]?transfer|own account|my own account|to self|from self|transfer to (?:my )?(?:own |another )?account|wallet top[\s-]?up|add(?:ed)? money to (?:my )?wallet)\b/i;
/** ATM / cash withdrawal. */
const CASH_WITHDRAWAL = /\b(atm|cash withdrawal|cash wdl|cash withdrawn|withdraw(?:al|n)? cash)\b/i;
/** Paying a credit card's bill (not buying something with the card). */
const CARD_BILL = /\b(credit card (?:bill|payment|due|repayment)|card (?:bill|repayment)|cc (?:bill|payment)|cred club|cred bill)\b/i;
/** Money given back for something paid before. */
const PAYBACK = /\b(refund(?:ed)?|cash[\s-]?back|reversal|reversed|chargeback|money back)\b/i;

export type InferredKind = { kind: TransactionKind; cashWithdrawal: boolean };

/** What the payee name and note say about how the row counts; `cashWithdrawal` lets the caller honour the "count ATM cash as spend" setting. */
export function inferKind(input: { type: TransactionType; name: string; note?: string | null | undefined }): InferredKind | null {
  const text = `${input.name} ${input.note ?? ''}`;
  if (CASH_WITHDRAWAL.test(text) && input.type === 'debit') return { kind: 'transfer', cashWithdrawal: true };
  if (OWN_ACCOUNT.test(text) || (CARD_BILL.test(text) && input.type === 'debit')) return { kind: 'transfer', cashWithdrawal: false };
  if (input.type === 'credit' && PAYBACK.test(text)) return { kind: 'payback', cashWithdrawal: false };
  return null;
}
