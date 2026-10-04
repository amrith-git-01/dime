/** Classify errors thrown by supabase-js (`PostgrestError` via `.throwOnError()`, storage errors, ...). */

const UNIQUE_VIOLATION = '23505';
/** `raise exception ... using errcode = 'P0002'` in our SQL functions: "not found". */
export const NO_DATA_FOUND = 'P0002';
export const INSUFFICIENT_PRIVILEGE = '42501';
/** Invalid text representation, e.g. a malformed uuid in a filter or RPC argument. */
export const INVALID_TEXT_REPRESENTATION = '22P02';

function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code;
  }
  return undefined;
}

export function hasPgCode(err: unknown, code: string): boolean {
  return pgCode(err) === code;
}

/** Postgres 23505 / PostgREST 409 conflicts (and only those). */
export function isUniqueViolation(err: unknown): boolean {
  if (hasPgCode(err, UNIQUE_VIOLATION) || pgCode(err) === '409') return true;
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return message.includes('duplicate key') || message.includes('unique constraint');
}
