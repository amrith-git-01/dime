import { env as workerEnv } from 'cloudflare:workers';
import { SignJWT } from 'jose';

import { createApp } from '../src/app';
import type { Bindings } from '../src/core/env';

export const baseEnv: Bindings = workerEnv;

/** Fresh env object per call so the per-isolate config cache never leaks between tests. */
export function makeEnv(overrides: Record<string, string | undefined> = {}): Bindings {
  return { ...baseEnv, ...overrides };
}

export const SUPABASE_URL = 'https://test-project.supabase.co';
export const ISSUER = `${SUPABASE_URL}/auth/v1`;

export interface TokenOptions {
  sub?: string | null;
  email?: string;
  aud?: string;
  iss?: string;
  expiresIn?: string | number;
  secret?: string;
  alg?: string;
}

export async function signToken(opts: TokenOptions = {}): Promise<string> {
  const jwt = new SignJWT({ ...(opts.email ? { email: opts.email } : {}) })
    .setProtectedHeader({ alg: opts.alg ?? 'HS256' })
    .setAudience(opts.aud ?? 'authenticated')
    .setIssuer(opts.iss ?? ISSUER)
    .setExpirationTime(opts.expiresIn ?? '1h');
  if (opts.sub !== null) jwt.setSubject(opts.sub ?? 'user-123');
  return jwt.sign(new TextEncoder().encode(opts.secret ?? baseEnv.SUPABASE_JWT_SECRET ?? ''));
}

export function testApp() {
  return createApp();
}

export const USER_ID = '11111111-1111-1111-1111-111111111111';

export interface CallOptions {
  method?: string;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  /** `false` = no Authorization header. Default: a valid token for `USER_ID`. */
  token?: string | false;
  email?: string;
  env?: Bindings;
}

/** Collects `waitUntil` promises so tests can await fire-and-forget work. */
export function makeCtx() {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    passThroughOnException: () => undefined,
    props: {},
  } as unknown as ExecutionContext;
  return { ctx, flush: () => Promise.all(pending) };
}

/** Call the real app as `USER_ID` (or anonymously) and return the Response. */
export async function call(path: string, opts: CallOptions = {}, ctx?: ExecutionContext): Promise<Response> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token !== false) {
    headers['Authorization'] = `Bearer ${opts.token ?? (await signToken({ sub: USER_ID, email: opts.email }))}`;
  }
  let body = opts.body;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['content-type'] = 'application/json';
  }
  return testApp().request(path, { method: opts.method ?? 'GET', headers, body }, opts.env ?? makeEnv(), ctx);
}
