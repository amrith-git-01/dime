import { describe, expect, it } from 'vitest';

import { createServiceClient } from '../src/core/supabase';
import { EXPO_BATCH_SIZE, EXPO_PUSH_URL, sendExpoPush } from '../src/features/notifications/push';
import { insertDeduped } from '../src/features/notifications/repository';
import { USER_ID, baseEnv, call } from './helpers';
import { json, rows, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();
const NID = '22222222-2222-2222-2222-222222222222';
const row = (i: number, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
  kind: 'budget_threshold',
  title: 'T',
  body: 'B',
  created_at: `2026-05-31T10:00:${String(59 - i).padStart(2, '0')}.000000+00:00`,
  read_at: null,
  action_type: 'home',
  action_transaction_id: null,
  ...over,
});

describe('GET /notifications', () => {
  it('maps rows (Z timestamps, action object) and defaults to filter=all, limit 50 (+1 probe)', async () => {
    stub.on('GET', '/rest/v1/notifications', () =>
      rows([row(1), row(2, { kind: 'transaction_auto', action_type: 'transaction_detail', action_transaction_id: NID })]),
    );
    const res = await call('/api/v1/notifications');
    expect(res.status).toBe(200);
    const body = await res.json<{ items: Record<string, unknown>[]; next_cursor: unknown }>();
    expect(body.next_cursor).toBeNull();
    expect(body.items[0]).toEqual({
      id: row(1).id,
      kind: 'budget_threshold',
      title: 'T',
      body: 'B',
      created_at: '2026-05-31T10:00:58.000000Z',
      read_at: null,
      action: { type: 'home', transaction_id: null },
    });
    expect(body.items[1]).toMatchObject({ action: { type: 'transaction_detail', transaction_id: NID } });
    const q = stub.last('GET', '/rest/v1/notifications').params;
    expect(q.get('limit')).toBe('51');
    expect(q.get('deleted_at')).toBe('is.null');
    expect(q.get('user_id')).toBe(`eq.${USER_ID}`);
    expect(q.get('read_at')).toBeNull();
    expect(q.get('created_at')).toBeNull();
    expect(q.get('order')).toBe('created_at.desc,id.desc');
  });

  it('C4: returns next_cursor when more rows exist and passes `before` as a strict lt filter', async () => {
    stub.on('GET', '/rest/v1/notifications', () => rows([row(1), row(2), row(3)]));
    const res = await call('/api/v1/notifications?limit=2&before=2026-06-01T00:00:00.000Z');
    const body = await res.json<{ items: unknown[]; next_cursor: string }>();
    expect(body.items).toHaveLength(2);
    expect(body.next_cursor).toBe('2026-05-31T10:00:57.000000Z');
    const q = stub.last('GET', '/rest/v1/notifications').params;
    expect(q.get('limit')).toBe('3');
    expect(q.get('created_at')).toBe('lt.2026-06-01T00:00:00.000Z');
  });

  it('accepts a `+` offset that arrived as a space in the cursor', async () => {
    stub.on('GET', '/rest/v1/notifications', () => rows([]));
    const encoded = await call('/api/v1/notifications?before=2026-05-31T10:00:57%2B00:00');
    expect(encoded.status).toBe(200);
    expect(stub.last('GET', '/rest/v1/notifications').params.get('created_at')).toBe('lt.2026-05-31T10:00:57+00:00');
    const spaced = await call('/api/v1/notifications?before=2026-05-31T10:00:57+00:00');
    expect(spaced.status).toBe(200);
    expect(stub.last('GET', '/rest/v1/notifications').params.get('created_at')).toBe('lt.2026-05-31T10:00:57+00:00');
  });

  it('applies unread/read filters', async () => {
    stub.on('GET', '/rest/v1/notifications', () => rows([]));
    await call('/api/v1/notifications?filter=unread');
    expect(stub.last('GET', '/rest/v1/notifications').params.get('read_at')).toBe('is.null');
    await call('/api/v1/notifications?filter=read');
    expect(stub.last('GET', '/rest/v1/notifications').params.get('read_at')).toBe('not.is.null');
  });

  it('422s with FastAPI shapes for bad filter, limit and cursor', async () => {
    const f = await call('/api/v1/notifications?filter=weird');
    expect(f.status).toBe(422);
    expect(await f.json()).toEqual({
      detail: [{ type: 'literal_error', loc: ['query', 'filter'], msg: "Input should be 'all', 'unread' or 'read'" }],
    });
    expect((await call('/api/v1/notifications?limit=0')).status).toBe(422);
    expect((await call('/api/v1/notifications?limit=101')).status).toBe(422);
    const b = await call('/api/v1/notifications?before=yesterday');
    expect(b.status).toBe(422);
    expect(await b.json()).toMatchObject({ detail: [{ type: 'datetime_parsing', loc: ['query', 'before'] }] });
  });
});

describe('notification mutations', () => {
  it('unread-count uses a HEAD count query', async () => {
    stub.on('HEAD', '/rest/v1/notifications', () => new Response(null, { headers: { 'content-range': '*/7' } }));
    expect(await (await call('/api/v1/notifications/unread-count')).json()).toEqual({ count: 7 });
    const q = stub.last('HEAD', '/rest/v1/notifications').params;
    expect(q.get('read_at')).toBe('is.null');
    expect(q.get('deleted_at')).toBe('is.null');
  });

  it('mark read returns the row; 404 when missing; 422 on a non-uuid id', async () => {
    stub.on('PATCH', '/rest/v1/notifications', () => rows([row(1, { id: NID, read_at: '2026-06-01T00:00:00+00:00' })]), {
      once: true,
    });
    const ok = await call(`/api/v1/notifications/${NID}/read`, { method: 'PATCH' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: NID, read_at: '2026-06-01T00:00:00Z' });
    expect(stub.last('PATCH', '/rest/v1/notifications').params.get('deleted_at')).toBe('is.null');

    stub.on('PATCH', '/rest/v1/notifications', () => rows([]));
    const missing = await call(`/api/v1/notifications/${NID}/read`, { method: 'PATCH' });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ detail: 'Notification not found.' });

    const bad = await call('/api/v1/notifications/not-a-uuid/read', { method: 'PATCH' });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ detail: [{ type: 'uuid_parsing', loc: ['path', 'id'] }] });
  });

  it('delete soft-deletes (sets deleted_at), 204; 404 when nothing matched', async () => {
    stub.on('PATCH', '/rest/v1/notifications', () => rows([{ id: NID }]), { once: true });
    const res = await call(`/api/v1/notifications/${NID}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(Object.keys(stub.last('PATCH', '/rest/v1/notifications').body as object)).toEqual(['deleted_at']);
    stub.on('PATCH', '/rest/v1/notifications', () => rows([]));
    expect((await call(`/api/v1/notifications/${NID}`, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('insertDeduped', () => {
  const entry = {
    user_id: USER_ID,
    kind: 'budget_threshold' as const,
    title: 'T',
    body: 'B',
    action_type: 'home' as const,
    action_transaction_id: null,
    dedupe_key: 'budget:monthly:80:2026-10',
  };

  it('upserts with on-conflict ignore and returns the created row', async () => {
    stub.on('POST', '/rest/v1/notifications', () => rows([row(1)]));
    const created = await insertDeduped(createServiceClient(baseEnv), entry);
    expect(created?.id).toBe(row(1).id);
    const req = stub.last('POST', '/rest/v1/notifications');
    expect(req.params.get('on_conflict')).toBe('user_id,dedupe_key');
    expect(req.headers.get('prefer')).toContain('resolution=ignore-duplicates');
    expect(req.body).toEqual(entry);
    expect(stub.find('GET', '/rest/v1/notifications')).toHaveLength(0);
  });

  it('returns null on conflict (no row) and requires a dedupe key', async () => {
    stub.on('POST', '/rest/v1/notifications', () => rows([]));
    expect(await insertDeduped(createServiceClient(baseEnv), entry)).toBeNull();
    await expect(insertDeduped(createServiceClient(baseEnv), { ...entry, dedupe_key: '' })).rejects.toThrow();
  });
});

describe('sendExpoPush', () => {
  const base = { title: 'Hi', body: 'Body', data: { kind: 'x' } };

  it('posts one message per token, split into batches of 100', async () => {
    stub.on('POST', '/--/api/v2/push/send', (c) => json({ data: (c.body as unknown[]).map(() => ({ status: 'ok' })) }));
    const tokens = Array.from({ length: EXPO_BATCH_SIZE + 5 }, (_, i) => `ExponentPushToken[${i}]`);
    await sendExpoPush({ ...base, tokens, onInvalidToken: () => undefined });
    const posts = stub.find('POST', '/--/api/v2/push/send');
    expect(posts.map((p) => (p.body as unknown[]).length).sort((a, b) => a - b)).toEqual([5, 100]);
    expect(posts[0]?.url.href).toBe(EXPO_PUSH_URL);
    expect((posts[0]?.body as Record<string, unknown>[])[0]).toMatchObject({
      title: 'Hi',
      body: 'Body',
      sound: 'default',
      channelId: 'dime-alerts',
      data: { kind: 'x' },
    });
  });

  it('prunes DeviceNotRegistered tokens only', async () => {
    stub.on('POST', '/--/api/v2/push/send', () =>
      json({
        data: [
          { status: 'ok' },
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
          { status: 'error', details: { error: 'MessageRateExceeded' } },
        ],
      }),
    );
    const pruned: string[] = [];
    await sendExpoPush({ ...base, tokens: ['a', 'bad', 'c'], onInvalidToken: (t) => void pruned.push(t) });
    expect(pruned).toEqual(['bad']);
  });

  it('never throws on upstream failure and does nothing for no tokens', async () => {
    stub.on('POST', '/--/api/v2/push/send', () => new Response('nope', { status: 500 }));
    await expect(sendExpoPush({ ...base, tokens: ['a'], onInvalidToken: () => undefined })).resolves.toBeUndefined();
    const before = stub.calls.length;
    await sendExpoPush({ ...base, tokens: [], onInvalidToken: () => undefined });
    expect(stub.calls).toHaveLength(before);
  });
});
