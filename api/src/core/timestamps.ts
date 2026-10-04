/**
 * Pydantic serializes a UTC `datetime` with a `Z` suffix while PostgREST sends `+00:00`. Normalize
 * so response bytes match what the mobile app received from the Python API.
 */
export function isoUtc(value: unknown): string {
  const s = String(value);
  return s.endsWith('+00:00') ? `${s.slice(0, -6)}Z` : s;
}

export function isoUtcOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : isoUtc(value);
}
