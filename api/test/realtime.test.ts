import { env as workerEnv } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { getConfig } from '../src/core/env';
import type { Bindings } from '../src/core/env';
import { handleIngestBatch, processIngestMessage } from '../src/features/ingest/consumer';
import type { IngestDeps } from '../src/features/ingest/consumer';
import { mediaStore } from '../src/features/media/storage';
import { envPublisher } from '../src/features/realtime/publish';
import { CAT_FOOD, FakeAi, FakeMessage, JOB, JPEG, completion, fakeBatch, mediaPayload, parsedSms } from './ingest-fixtures';
import { USER_ID, call, makeCtx, makeEnv, signToken, testApp } from './helpers';
import { seedCategory, seedJob, seedTransaction, seedUser, testDb, uid } from './db';
import { json, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();
const OTHER = '22222222-2222-2222-2222-222222222222';

type Frame = { table: string; eventType: string; new: Record<string, unknown>; old: Record<string, unknown> };

interface Socket {
  ws: WebSocket;
  frames: string[];
  closed: Promise<CloseEvent>;
  /** Resolves with the next frame that is not yet consumed. */
  next(): Promise<string>;
  /** Parsed events received so far (waits until `count` have arrived). */
  events(count: number): Promise<Frame[]>;
}

async function openSocket(headers: Record<string, string>, env: Bindings = makeEnv()): Promise<{ res: Response; socket: Socket | null }> {
  const res = await testApp().request('/api/v1/realtime', { headers: { Upgrade: 'websocket', ...headers } }, env);
  const ws = res.webSocket;
  if (!ws) return { res, socket: null };
  const frames: string[] = [];
  const waiters: (() => void)[] = [];
  ws.addEventListener('message', (e) => {
    frames.push(String(e.data));
    waiters.splice(0).forEach((w) => w());
  });
  const closed = new Promise<CloseEvent>((resolve) => ws.addEventListener('close', resolve));
  ws.accept();
  let read = 0;
  const waitFor = async (n: number) => {
    while (frames.length < n) await new Promise<void>((r) => waiters.push(r));
  };
  return {
    res,
    socket: {
      ws,
      frames,
      closed,
      next: async () => {
        await waitFor(read + 1);
        return frames[read++] as string;
      },
      events: async (count) => {
        await waitFor(count);
        return frames.slice(0, count).map((f) => JSON.parse(f) as Frame);
      },
    },
  };
}

const bearer = async (sub = USER_ID, extra: { expiresIn?: string | number } = {}) => ({ Authorization: `Bearer ${await signToken({ sub, ...extra })}` });

async function connect(sub = USER_ID, env?: Bindings): Promise<Socket> {
  const { res, socket } = await openSocket(await bearer(sub), env);
  expect(res.status).toBe(101);
  return socket as Socket;
}

const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe('GET /api/v1/realtime: upgrade', () => {
  it('answers 426 to a plain request', async () => {
    const res = await call('/api/v1/realtime');
    expect(res.status).toBe(426);
    expect(res.headers.get('Upgrade')).toBe('websocket');
  });

  it('accepts Authorization: Bearer', async () => {
    const { res, socket } = await openSocket(await bearer());
    expect(res.status).toBe(101);
    socket?.ws.close(1000);
  });

  it('accepts the dime.v1 + bearer.<token> subprotocol pair and echoes dime.v1', async () => {
    const token = await signToken({ sub: USER_ID });
    const { res, socket } = await openSocket({ 'Sec-WebSocket-Protocol': `dime.v1, bearer.${token}` });
    expect(res.status).toBe(101);
    expect(res.headers.get('Sec-WebSocket-Protocol')).toBe('dime.v1');
    socket?.ws.close(1000);
  });

  it('rejects a missing, malformed, expired-signature or query-string token with 401 before upgrading', async () => {
    expect((await openSocket({})).res.status).toBe(401);
    expect((await openSocket({ Authorization: 'Bearer nope' })).res.status).toBe(401);
    const forged = await signToken({ sub: USER_ID, secret: 'another-secret-that-is-long-enough-for-hs256' });
    expect((await openSocket({ Authorization: `Bearer ${forged}` })).res.status).toBe(401);
    const good = await signToken({ sub: USER_ID });
    const res = await testApp().request(`/api/v1/realtime?access_token=${good}`, { headers: { Upgrade: 'websocket' } }, makeEnv());
    expect(res.status).toBe(401);
  });

  it('answers ping with pong', async () => {
    const socket = await connect();
    socket.ws.send('ping');
    expect(await socket.next()).toBe('pong');
    socket.ws.close(1000);
  });

  it('closes a socket with 4001 once its token has expired and an event arrives', async () => {
    await seedUser(OTHER);
    const { res, socket } = await openSocket(await bearer(USER_ID, { expiresIn: '2s' }));
    expect(res.status).toBe(101);
    await tick(2300);
    const { ctx, flush } = makeCtx();
    await call('/api/v1/transactions?timezone=Asia%2FKolkata', { method: 'POST', json: { amount: '5', type: 'debit', counterparty_name: 'Tea', transaction_at: '2026-10-04T10:00:00+05:30' } }, ctx);
    await flush();
    const closed = await socket?.closed;
    expect(closed?.code).toBe(4001);
  });
});

describe('broadcast from HTTP routes', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    amount: '250.5',
    type: 'debit',
    counterparty_name: 'Acme Corp',
    transaction_at: '2026-10-04T10:00:00+05:30',
    ...over,
  });
  const post = async (json_: unknown) => {
    const { ctx, flush } = makeCtx();
    const res = await call('/api/v1/transactions?timezone=Asia%2FKolkata', { method: 'POST', json: json_ }, ctx);
    await flush();
    return res;
  };

  it('delivers INSERT, UPDATE and the soft delete (an UPDATE with deleted_at) in the Supabase shape', async () => {
    const socket = await connect();
    expect((await post(body())).status).toBe(201);
    const [insert] = await socket.events(1);
    expect(insert).toMatchObject({
      table: 'transactions',
      eventType: 'INSERT',
      old: {},
      new: { user_id: USER_ID, amount: '250.50', type: 'debit', counterparty_name: 'Acme Corp', deleted_at: null, detected_via: 'manual' },
    });
    const id = insert?.new['id'] as string;

    const { ctx, flush } = makeCtx();
    const patch = await call(`/api/v1/transactions/${id}?timezone=Asia%2FKolkata`, { method: 'PATCH', json: body({ amount: '300', note: 'edited' }) }, ctx);
    expect(patch.status).toBe(200);
    await flush();
    const [, update] = await socket.events(2);
    expect(update).toMatchObject({ table: 'transactions', eventType: 'UPDATE', old: { id }, new: { id, amount: '300.00', note: 'edited' } });

    const del = await call(`/api/v1/transactions/${id}`, { method: 'DELETE' }, ctx);
    expect(del.status).toBe(204);
    await flush();
    const [, , removed] = await socket.events(3);
    expect(removed).toMatchObject({ table: 'transactions', eventType: 'UPDATE', old: { id }, new: { id } });
    expect(typeof removed?.new['deleted_at']).toBe('string');
    socket.ws.close(1000);
  });

  it('does not deliver to another user, and delivers to every device of the owner', async () => {
    await seedUser(OTHER);
    const mine = await connect();
    const mineToo = await connect();
    const theirs = await connect(OTHER);
    expect((await post(body())).status).toBe(201);
    await mine.next();
    await mineToo.next();
    await tick();
    expect(theirs.frames).toEqual([]);
    for (const s of [mine, mineToo, theirs]) s.ws.close(1000);
  });

  it('broadcasts a category create, update and delete (with the reassigned transactions)', async () => {
    const socket = await connect();
    const { ctx, flush } = makeCtx();
    const created = await call('/api/v1/categories', { method: 'POST', json: { name: 'Pets', icon_name: 'Dog', color: '#112233' } }, ctx);
    expect(created.status).toBe(201);
    const category = await created.json<{ id: string }>();
    await flush();
    const [insert] = await socket.events(1);
    expect(insert).toMatchObject({ table: 'categories', eventType: 'INSERT', old: {}, new: { id: category.id, name: 'Pets', user_id: USER_ID } });

    const patched = await call(`/api/v1/categories/${category.id}`, { method: 'PATCH', json: { name: 'Pets 2' } }, ctx);
    expect(patched.status).toBe(200);
    await flush();
    const [, update] = await socket.events(2);
    expect(update).toMatchObject({ table: 'categories', eventType: 'UPDATE', old: { id: category.id }, new: { name: 'Pets 2' } });

    const target = uid();
    await seedCategory({ id: target, user_id: USER_ID, name: 'Reassign target', is_system: false });
    const txId = await seedTransaction({ category_id: category.id });
    const del = await call(`/api/v1/categories/${category.id}?reassign_to_category_id=${target}`, { method: 'DELETE' }, ctx);
    expect(del.status).toBe(204);
    await flush();
    const [, , moved, removed] = await socket.events(4);
    expect(moved).toMatchObject({ table: 'transactions', eventType: 'UPDATE', old: { id: txId }, new: { id: txId, category_id: target } });
    expect(removed).toEqual({ table: 'categories', eventType: 'DELETE', new: {}, old: { id: category.id } });
    socket.ws.close(1000);
  });

  it('a failing broadcast never fails the write', async () => {
    const env = makeEnv({
      USER_HUB: {
        idFromName: () => 'x',
        get: () => ({
          broadcast: () => Promise.reject(new Error('hub down')),
        }),
      },
    });
    const { ctx, flush } = makeCtx();
    const res = await call('/api/v1/transactions?timezone=Asia%2FKolkata', { method: 'POST', json: body(), env }, ctx);
    await flush();
    expect(res.status).toBe(201);
  });
});

describe('broadcast from the ingest queue consumer', () => {
  const fakeAi = new FakeAi();
  const deps = (env: Bindings): IngestDeps => ({
    db: testDb(),
    storage: mediaStore(env),
    config: getConfig(env),
    ai: fakeAi.asAi(),
    publisher: envPublisher(env),
  });

  it('processIngestMessage broadcasts the created transaction to the job owner', async () => {
    const env = makeEnv({ DEEPSEEK_API_KEY: 'ds-key' });
    await seedCategory({ id: CAT_FOOD, name: 'Food', icon_name: 'Utensils', color: '#111111' });
    await seedJob({ id: JOB, kind: 'receipt', payload: mediaPayload() });
    await workerEnv.MEDIA.put(mediaPayload().object_path, JPEG, { httpMetadata: { contentType: 'image/jpeg' } });
    stub.on('POST', '/chat/completions', () => json(completion(parsedSms({ category: 'Food' }))));
    const socket = await connect();
    const m = new FakeMessage({ job_id: JOB, kind: 'receipt' }, 1);
    await processIngestMessage(m, deps(env));
    expect(m.acked).toBe(true);
    const [event] = await socket.events(1);
    expect(event).toMatchObject({
      table: 'transactions',
      eventType: 'INSERT',
      old: {},
      new: { user_id: USER_ID, detected_via: 'scan', category_id: CAT_FOOD, deleted_at: null },
    });
    expect(typeof event?.new['amount']).toBe('string');
    socket.ws.close(1000);
  });

  it('handleIngestBatch wires the publisher from env', async () => {
    const env = makeEnv({ DEEPSEEK_API_KEY: 'ds-key', AI: fakeAi.asAi() });
    await seedJob({ id: JOB, kind: 'receipt', payload: mediaPayload() });
    await workerEnv.MEDIA.put(mediaPayload().object_path, JPEG, { httpMetadata: { contentType: 'image/jpeg' } });
    stub.on('POST', '/chat/completions', () => json(completion(parsedSms())));
    const socket = await connect();
    await handleIngestBatch(fakeBatch('dime-ingest', [new FakeMessage({ job_id: JOB, kind: 'receipt' }, 1)]), env);
    const [event] = await socket.events(1);
    expect(event).toMatchObject({ table: 'transactions', eventType: 'INSERT' });
    socket.ws.close(1000);
  });
});
