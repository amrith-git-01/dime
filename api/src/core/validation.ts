import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import { HTTPException } from 'hono/http-exception';
import * as z from 'zod';
import type { ZodError, ZodType } from 'zod';

/** FastAPI names the request part in `loc`; map Hono's validation targets to the same words. */
const LOC: Record<keyof ValidationTargets, string> = {
  json: 'body',
  form: 'body',
  query: 'query',
  param: 'path',
  header: 'header',
  cookie: 'cookie',
};

export interface ValidationDetail {
  type: string;
  loc: (string | number)[];
  msg: string;
}

type Issue = ZodError['issues'][number];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const quoteList = (values: readonly unknown[]): string => {
  const quoted = values.map((v) => `'${String(v)}'`);
  if (quoted.length <= 1) return quoted.join('');
  return `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1] ?? ''}`;
};

const INVALID_TYPE: Record<string, [string, string]> = {
  string: ['string_type', 'Input should be a valid string'],
  boolean: ['bool_type', 'Input should be a valid boolean'],
  int: ['int_type', 'Input should be a valid integer'],
  number: ['float_type', 'Input should be a valid number'],
  object: ['model_attributes_type', 'Input should be a valid dictionary or object to extract fields from'],
  array: ['list_type', 'Input should be a valid list'],
};

/** Map one zod issue to the Pydantic v2 `{type, msg}` pair the mobile app (and FastAPI) used. */
function describe(issue: Issue): { type: string; msg: string } {
  const i = issue as Issue & Record<string, unknown>;
  switch (issue.code) {
    case 'invalid_type': {
      if (issue.message.includes('received undefined')) return { type: 'missing', msg: 'Field required' };
      const expected = typeof i['expected'] === 'string' ? i['expected'] : '';
      const [type, msg] = INVALID_TYPE[expected] ?? ['type_error', issue.message];
      return { type, msg };
    }
    case 'too_small': {
      const min = Number(i['minimum']);
      const inclusive = i['inclusive'] !== false;
      if (i['origin'] === 'string') return { type: 'string_too_short', msg: `String should have at least ${plural(min, 'character')}` };
      if (i['origin'] === 'array') return { type: 'too_short', msg: `List should have at least ${plural(min, 'item')} after validation` };
      return inclusive
        ? { type: 'greater_than_equal', msg: `Input should be greater than or equal to ${min}` }
        : { type: 'greater_than', msg: `Input should be greater than ${min}` };
    }
    case 'too_big': {
      const max = Number(i['maximum']);
      const inclusive = i['inclusive'] !== false;
      if (i['origin'] === 'string') return { type: 'string_too_long', msg: `String should have at most ${plural(max, 'character')}` };
      if (i['origin'] === 'array') return { type: 'too_long', msg: `List should have at most ${plural(max, 'item')} after validation` };
      return inclusive
        ? { type: 'less_than_equal', msg: `Input should be less than or equal to ${max}` }
        : { type: 'less_than', msg: `Input should be less than ${max}` };
    }
    case 'invalid_value': {
      const values = Array.isArray(i['values']) ? (i['values'] as unknown[]) : [];
      return { type: 'literal_error', msg: `Input should be ${quoteList(values)}` };
    }
    case 'invalid_format': {
      const format = String(i['format']);
      if (format === 'guid' || format === 'uuid') return { type: 'uuid_parsing', msg: 'Input should be a valid UUID' };
      if (format === 'regex' && typeof i['pattern'] === 'string') {
        return { type: 'string_pattern_mismatch', msg: `String should match pattern '${i['pattern']}'` };
      }
      return { type: 'value_error', msg: issue.message };
    }
    case 'custom': {
      const params = i['params'] as { type?: unknown } | undefined;
      // Custom type from our own helpers (e.g. decimal_parsing): message is already Pydantic-style.
      if (typeof params?.type === 'string') return { type: params.type, msg: issue.message };
      // Pydantic prefixes messages raised from validators (ValueError) this way.
      return { type: 'value_error', msg: `Value error, ${issue.message}` };
    }
    default:
      return { type: issue.code, msg: issue.message };
  }
}

/** Convert a ZodError to FastAPI/Pydantic-style `detail` items: `{type, loc, msg}`. */
function toDetail(error: { issues: ZodError['issues'] }, target: keyof ValidationTargets): ValidationDetail[] {
  const out: ValidationDetail[] = [];
  for (const issue of error.issues) {
    const base = [LOC[target], ...issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p))];
    if (issue.code === 'unrecognized_keys') {
      // Pydantic reports `extra="forbid"` once per offending key.
      for (const key of issue.keys) {
        out.push({ type: 'extra_forbidden', loc: [...base, key], msg: 'Extra inputs are not permitted' });
      }
      continue;
    }
    out.push({ loc: base, ...describe(issue) });
  }
  return out;
}

/** Throw a FastAPI-shaped 422 from code that parses the request itself (e.g. multipart bodies). */
export function unprocessable(detail: ValidationDetail[]): never {
  throw new HTTPException(422, { res: Response.json({ detail }, { status: 422 }) });
}

/**
 * UUID in any 8-4-4-4-12 hex form (Python's `UUID` accepts every version), lowercased like
 * `str(UUID(...))`. Invalid input fails with FastAPI's `uuid_parsing` 422.
 */
export const uuidString = z.guid().transform((s) => s.toLowerCase());

/**
 * Request validation with the FastAPI 422 shape: `{"detail": [{"type","loc","msg"}, ...]}`.
 * Use instead of calling `zValidator` directly:
 *   app.post('/', validate('json', schema), (c) => { const body = c.req.valid('json'); ... })
 */
export function validate<T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ detail: toDetail(result.error, target) }, 422);
    }
  });
}
