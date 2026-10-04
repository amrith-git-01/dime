/**
 * Normalisation + diffing of JSON responses from the Python and the TypeScript backends.
 *
 * Intentional, accepted deviations that must NOT show up as differences:
 *  - money strings: Python `"5000.0"` vs TS `"5000.00"` (a decimal string is padded / trimmed to 2 places);
 *  - timestamps: `+00:00` vs `Z`, `.000000` vs none, other offsets (all converted to UTC `...Z`);
 *  - signed Storage URLs: the query string (`?token=...`) differs on every call, the path must match;
 *  - request ids (`request_id` fields);
 *  - ordering tie-breaks: same items in another order is reported as a WARN, not a failure.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const DECIMAL = /^-?\d+\.\d+$/;
const SIGNED_URL = /^https?:\/\/[^?#]+\/storage\/v1\/object\/(sign|authenticated|public)\/[^?#]+\?/;
/** Keys whose values are volatile per request and are dropped. */
const IGNORED_KEYS = new Set(['request_id']);

export function normalizeDecimal(s: string): string {
  const [whole = '', frac = ''] = s.split('.');
  const trimmed = frac.replace(/0+$/, '');
  return `${whole}.${trimmed.padEnd(2, '0')}`;
}

export function normalizeString(s: string): string {
  if (ISO_DATETIME.test(s)) {
    const iso = s.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const ms = Date.parse(iso);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  if (SIGNED_URL.test(s)) return s.slice(0, s.indexOf('?')) + '?<signature>';
  if (DECIMAL.test(s)) return normalizeDecimal(s);
  return s;
}

export function normalize(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return normalizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort()) {
      if (IGNORED_KEYS.has(key)) continue;
      out[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return JSON.stringify(value) ?? null;
}

export interface Diff {
  path: string;
  kind: 'changed' | 'missing_in_ts' | 'extra_in_ts' | 'order' | 'length';
  py?: Json;
  ts?: Json;
}

const canon = (v: Json): string => JSON.stringify(v);

function numbersEqual(a: number, b: number): boolean {
  return a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Compare two normalised values; `order` diffs mean "same items, different order" (a WARN). */
export function diffJson(py: Json, ts: Json, path = '$', out: Diff[] = []): Diff[] {
  if (typeof py === 'number' && typeof ts === 'number') {
    if (!numbersEqual(py, ts)) out.push({ path, kind: 'changed', py, ts });
    return out;
  }
  if (Array.isArray(py) && Array.isArray(ts)) {
    if (py.length !== ts.length) {
      out.push({ path, kind: 'length', py: py.length, ts: ts.length });
      return out;
    }
    const same = py.every((item, i) => canon(item) === canon(ts[i]!));
    if (same) return out;
    const sortedPy = py.map(canon).sort();
    const sortedTs = ts.map(canon).sort();
    if (sortedPy.every((item, i) => item === sortedTs[i])) {
      out.push({ path, kind: 'order' });
      return out;
    }
    py.forEach((item, i) => diffJson(item, ts[i]!, `${path}[${i}]`, out));
    return out;
  }
  if (py !== null && ts !== null && typeof py === 'object' && typeof ts === 'object' && !Array.isArray(py) && !Array.isArray(ts)) {
    for (const key of new Set([...Object.keys(py), ...Object.keys(ts)])) {
      const p = path === '$' ? `$.${key}` : `${path}.${key}`;
      if (!(key in ts)) out.push({ path: p, kind: 'missing_in_ts', py: py[key] });
      else if (!(key in py)) out.push({ path: p, kind: 'extra_in_ts', ts: ts[key] });
      else diffJson(py[key] as Json, ts[key] as Json, p, out);
    }
    return out;
  }
  if (canon(py) !== canon(ts)) out.push({ path, kind: 'changed', py, ts });
  return out;
}

/** Replace volatile values (ids, timestamps) with placeholders: compares the SHAPE of write responses. */
export function shapeOf(value: unknown): Json {
  const n = normalize(value);
  const walk = (v: Json): Json => {
    if (typeof v === 'string') {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return '<uuid>';
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return '<timestamp>';
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(n);
}
