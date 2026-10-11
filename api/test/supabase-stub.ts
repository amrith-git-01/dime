import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Test double for outbound HTTP (Brevo, Expo push, DeepSeek, ...): it replaces
 * `globalThis.fetch`, so the REAL clients run and tests assert on the requests they produce (path,
 * headers, body) while scripting the responses. Relational data is NOT stubbed: it lives in a real
 * local D1 (see `test/db.ts`).
 *
 *   const stub = useSupabaseStub();             // call at describe level; installs/uninstalls per test
 *   stub.on('GET', '/rest/v1/categories', () => rows([...]));
 *   ...request the app...
 *   expect(stub.last('POST', '/rest/v1/rpc/x').body).toEqual({...});
 */
export interface RecordedCall {
  method: string;
  url: URL;
  /** Path + query as a string, e.g. `/rest/v1/users?select=id&id=eq.1`. */
  path: string;
  params: URLSearchParams;
  headers: Headers;
  /** Parsed JSON body, raw ArrayBuffer for binary uploads, or undefined. */
  body: unknown;
}

export type Responder = (call: RecordedCall) => Response | Promise<Response>;

interface Route {
  method: string;
  match: string | RegExp;
  respond: Responder;
  once: boolean;
}

export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

/** PostgREST array response; `total` adds the `Content-Range` header used by `count: 'exact'`. */
export const rows = (data: unknown[], total?: number) =>
  json(data, total === undefined ? {} : { headers: { 'content-type': 'application/json', 'content-range': `0-${Math.max(data.length - 1, 0)}/${total}` } });

export const pgError = (code: string, message: string, status = 400) =>
  json({ code, message, details: null, hint: null }, { status });

export class SupabaseStub {
  readonly calls: RecordedCall[] = [];
  private routes: Route[] = [];
  private original: typeof fetch | undefined;

  on(method: string, match: string | RegExp, respond: Responder, opts: { once?: boolean } = {}): this {
    this.routes.push({ method: method.toUpperCase(), match, respond, once: opts.once ?? false });
    return this;
  }

  install(): void {
    this.original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      const url = new URL(req.url);
      const type = req.headers.get('content-type') ?? '';
      let body: unknown;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (type.includes('json')) {
          const text = await req.text();
          body = text ? (JSON.parse(text) as unknown) : undefined;
        }
        else body = await req.arrayBuffer();
      }
      const call: RecordedCall = {
        method: req.method,
        url,
        path: url.pathname + url.search,
        params: url.searchParams,
        headers: req.headers,
        body,
      };
      this.calls.push(call);
      const idx = this.routes.findIndex(
        (r) => r.method === call.method && (typeof r.match === 'string' ? call.path.includes(r.match) : r.match.test(call.path)),
      );
      const route = this.routes[idx];
      if (!route) {
        return pgError('STUB_UNHANDLED', `No stub for ${call.method} ${call.path}`, 599);
      }
      if (route.once) this.routes.splice(idx, 1);
      const res = await route.respond(call);
      // `.single()` sends Accept: application/vnd.pgrst.object+json; PostgREST then returns the bare object.
      if (call.headers.get('accept')?.includes('vnd.pgrst.object+json') && res.ok) {
        const data: unknown = await res.clone().json().catch(() => undefined);
        if (Array.isArray(data)) return json(data[0] ?? null, { status: data.length === 1 ? 200 : 406 });
      }
      return res;
    });
  }

  uninstall(): void {
    if (this.original) globalThis.fetch = this.original;
  }

  find(method: string, match: string | RegExp): RecordedCall[] {
    return this.calls.filter(
      (c) => c.method === method.toUpperCase() && (typeof match === 'string' ? c.path.includes(match) : match.test(c.path)),
    );
  }

  last(method: string, match: string | RegExp): RecordedCall {
    const found = this.find(method, match).at(-1);
    if (!found) throw new Error(`No recorded ${method} ${String(match)}; calls: ${this.calls.map((c) => `${c.method} ${c.path}`).join(' | ')}`);
    return found;
  }
}

/** Registers beforeEach/afterEach hooks; returns a fresh stub per test (same object, reset). */
export function useSupabaseStub(): SupabaseStub {
  const holder = new SupabaseStub();
  beforeEach(() => {
    holder.calls.length = 0;
    (holder as unknown as { routes: Route[] }).routes = [];
    holder.install();
  });
  afterEach(() => {
    holder.uninstall();
  });
  return holder;
}
