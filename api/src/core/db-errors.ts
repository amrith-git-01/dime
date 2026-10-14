/** Classify errors thrown by D1 and the typed errors our repositories raise in place of Postgres SQLSTATEs. */

/** Our stand-in for `raise exception ... using errcode = 'P0002'`: "not found". */
export const NO_DATA_FOUND = 'P0002';
/** Stand-in for 42501: the caller may not change this row (system categories). */
export const INSUFFICIENT_PRIVILEGE = '42501';

/** A category of the wrong scope for the write (e.g. a budget on a recurring category). */
export const WRONG_SCOPE = 'DIME1';

/** A repository-level failure carrying a SQLSTATE-style code that services map to HTTP statuses. */
export class DbCodedError extends Error {
  override name = 'DbCodedError';
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function hasPgCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === code;
}

function messages(err: unknown): string {
  const parts: string[] = [];
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 3; e = e.cause, depth += 1) parts.push(e.message);
  return parts.join(' | ').toLowerCase();
}

/** SQLite `UNIQUE constraint failed: ...` (D1 prefixes it with `D1_ERROR:`), also from inside a batch. */
export function isUniqueViolation(err: unknown): boolean {
  return messages(err).includes('unique constraint failed');
}

/** True when D1 reports a temporary problem (overload, network, reset) rather than a bad statement. */
export function isTransientDbError(err: unknown): boolean {
  return /network|timed? ?out|overloaded|reset|connection|temporarily|internal error|try again/.test(messages(err));
}
