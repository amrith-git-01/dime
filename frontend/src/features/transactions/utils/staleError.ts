/** The message a stale write shows: the row was changed on another device after this one read it. */
export const STALE_TRANSACTION_MESSAGE = "Changed on another device";

/** A 409 `stale` turned into something screens can recognise (their own refetch and toast follow). */
export class TransactionStaleError extends Error {
  override name = "TransactionStaleError";
  constructor() {
    super(STALE_TRANSACTION_MESSAGE);
  }
}

export function isTransactionStaleError(error: unknown): error is TransactionStaleError {
  return error instanceof TransactionStaleError;
}
