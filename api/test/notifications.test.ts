import { describe, expect, it } from 'vitest';

import { EXPO_BATCH_SIZE, EXPO_PUSH_URL, sendExpoPush } from '../src/features/notifications/push';
import { insertDeduped } from '../src/features/notifications/repository';
import { USER_ID, call } from './helpers';
import { oneRow, rowsOf, seedNotification, seedTransaction, seedUser, testDb } from './db';
import { json, useSupabaseStub } from './supabase-stub';

// Notifications live in D1; the stub only serves the outbound Expo push endpoint.
const stub = useSupabaseStub();
const NID = '22222222-2222-2222-2222-222222222222';
const OTHER_USER = '33333333-3333-3333-3333-333333333333';
const nid = (i: number) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
/** Higher index = older timestamp, like the original fixtures: row 1 is the newest. */
const seedRow = (i: number, over: Parameters<typeof seedNotification>[0] = {}) =>
  seedNotification({
    id: nid(i),
    kind: 'budget_threshold',
    title: 'T',
    body: 'B',
    created_at: `2026-05-31T10:00:${String(59 - i).padStart(2, '0')}.000Z`,
    action_type: 'home',
    ...over,
  });

describe('GET /notifications', () => {
  it('maps rows (Z timestamps, action object) and defaults to filter=all, limit 50', async () => {
    const tx = await seedTransaction({ id: NID });
    await seedRow(1);
    await seedRow(2, { kind: 'transaction_auto', action_type: 'transaction_detail', action_transaction_id: tx });
    const res = await call('/api/v1/notifications');
    expect(res.status).toBe(200);
    const body = await res.json<{ items: Record<string, unknown>[]; next_cursor: unknown }>();
    expect(body.next_cursor).toBeNull();
    expect(body.items[0]).toEqual({
      id: nid(1),
      kind: 'budget_threshold',
      title: 'T',
      body: 'B',
      created_at: '2026-05-31T10:00:58.000Z',
      read_at: null,
      action: { type: 'home', transaction_id: null },
    });
    expect(body.items[1]).toMatchObject({ action: { type: 'transaction_detail', transaction_id: NID } });
  });

  it('is scoped to the caller and hides soft-deleted rows; newest first', async () => {
    await seedUser(OTHER_USER);
    await seedRow(1);
    await seedRow(2, { deleted_at: '2026-06-01T00:00:00.000Z' });
    await seedRow(3, { user_id: OTHER_USER });
    await seedRow(4);
    const body = await (await call('/api/v1/notifications')).json<{ items: { id: string }[] }>();
    expect(body.items.map((i) => i.id)).toEqual([nid(1), nid(4)]);
  });

  it('C4: returns next_cursor when more rows exist and `before` is a strict lt filter', async () => {
    await seedRow(1);
    await seedRow(2);
    await seedRow(3);
    await seedRow(4, { created_at: '2026-06-02T00:00:00.000Z' });
    const res = await call('/api/v1/notifications?limit=2&before=2026-06-01T00:00:00.000Z');
    const body = await res.json<{ items: { id: string }[]; next_cursor: string }>();
    expect(body.items.map((i) => i.id)).toEqual([nid(1), nid(2)]);
    expect(body.next_cursor).toBe(`2026-05-31T10:00:57.000Z|${nid(2)}`);
    // The cursor is exclusive: following it returns the remaining row only.
    const next = await (await call(`/api/v1/notifications?limit=2&before=${encodeURIComponent(body.next_cursor)}`)).json<{
      items: { id: string }[];
      next_cursor: unknown;
    }>();
    expect(next.items.map((i) => i.id)).toEqual([nid(3)]);
    expect(next.next_cursor).toBeNull();
  });

  it('the cursor is (created_at, id): rows sharing a created_at are neither skipped nor repeated', async () => {
    const same = '2026-05-31T10:00:00.000Z';
    for (const n of [1, 2, 3, 4, 5]) await seedRow(n, { created_at: same });
    const seen: string[] = [];
    let url = '/api/v1/notifications?limit=2';
    for (let page = 0; page < 5; page++) {
      const body = await (await call(url)).json<{ items: { id: string }[]; next_cursor: string | null }>();
      seen.push(...body.items.map((i) => i.id));
      if (!body.next_cursor) break;
      url = `/api/v1/notifications?limit=2&before=${encodeURIComponent(body.next_cursor)}`;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect((await call('/api/v1/notifications?before=2026-05-31T10:00:00.000Z|not%20an%20id!')).status).toBe(422);
  });

  it('accepts a `+` offset that arrived as a space in the cursor', async () => {
    await seedRow(1, { created_at: '2026-05-31T10:00:56.000Z' });
    await seedRow(2, { created_at: '2026-05-31T10:00:58.000Z' });
    const encoded = await call('/api/v1/notifications?before=2026-05-31T10:00:57%2B00:00');
    expect(encoded.status).toBe(200);
    expect((await encoded.json<{ items: { id: string }[] }>()).items.map((i) => i.id)).toEqual([nid(1)]);
    const spaced = await call('/api/v1/notifications?before=2026-05-31T10:00:57+00:00');
    expect(spaced.status).toBe(200);
    expect((await spaced.json<{ items: { id: string }[] }>()).items.map((i) => i.id)).toEqual([nid(1)]);
  });

  it('applies unread/read filters', async () => {
    await seedRow(1);
    await seedRow(2, { read_at: '2026-06-01T00:00:00.000Z' });
    const unread = await (await call('/api/v1/notifications?filter=unread')).json<{ items: { id: string }[] }>();
    expect(unread.items.map((i) => i.id)).toEqual([nid(1)]);
    const read = await (await call('/api/v1/notifications?filter=read')).json<{ items: { id: string }[] }>();
    expect(read.items.map((i) => i.id)).toEqual([nid(2)]);
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
  it("unread-count counts the caller's unread, undeleted rows", async () => {
    await seedUser(OTHER_USER);
    await seedRow(1);
    await seedRow(2);
    await seedRow(3, { read_at: '2026-06-01T00:00:00.000Z' });
    await seedRow(4, { deleted_at: '2026-06-01T00:00:00.000Z' });
    await seedRow(5, { user_id: OTHER_USER });
    expect(await (await call('/api/v1/notifications/unread-count')).json()).toEqual({ count: 2 });
  });

  it('mark read returns the row; 404 when missing; 422 on a non-uuid id', async () => {
    await seedRow(1, { id: NID });
    const ok = await call(`/api/v1/notifications/${NID}/read`, { method: 'PATCH' });
    expect(ok.status).toBe(200);
    const body = await ok.json<{ id: string; read_at: string }>();
    expect(body.id).toBe(NID);
    expect(body.read_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect((await oneRow<{ read_at: string }>('notifications', 'id = ?', NID))?.read_at).toBe(body.read_at);

    // Not found: unknown id, another user's row, a soft-deleted row.
    await seedUser(OTHER_USER);
    const foreign = await seedRow(2, { user_id: OTHER_USER });
    const gone = await seedRow(3, { deleted_at: '2026-06-01T00:00:00.000Z' });
    for (const id of ['44444444-4444-4444-4444-444444444444', foreign, gone]) {
      const missing = await call(`/api/v1/notifications/${id}/read`, { method: 'PATCH' });
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ detail: 'Notification not found.' });
    }

    const bad = await call('/api/v1/notifications/not-a-uuid/read', { method: 'PATCH' });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ detail: [{ type: 'uuid_parsing', loc: ['path', 'id'] }] });
  });

  it('delete soft-deletes (sets deleted_at), 204; 404 when nothing matched', async () => {
    await seedRow(1, { id: NID });
    const res = await call(`/api/v1/notifications/${NID}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    const row = await oneRow<{ deleted_at: string | null; read_at: string | null }>('notifications', 'id = ?', NID);
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.read_at).toBeNull();
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

  it('inserts a row and returns it', async () => {
    const created = await insertDeduped(testDb(), entry);
    expect(created).toMatchObject({ kind: 'budget_threshold', title: 'T', body: 'B', action_type: 'home', read_at: null });
    expect(created?.id).toMatch(/^[0-9a-f-]{36}$/);
    const stored = await rowsOf<{ dedupe_key: string; user_id: string }>('notifications');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ dedupe_key: entry.dedupe_key, user_id: USER_ID });
  });

  it('returns null on conflict (no second row, even if the first was soft-deleted) and requires a dedupe key', async () => {
    expect(await insertDeduped(testDb(), entry)).not.toBeNull();
    expect(await insertDeduped(testDb(), entry)).toBeNull();
    await testDb().prepare('UPDATE notifications SET deleted_at = ?').bind('2026-06-01T00:00:00.000Z').run();
    expect(await insertDeduped(testDb(), entry)).toBeNull();
    expect(await rowsOf('notifications')).toHaveLength(1);
    await expect(insertDeduped(testDb(), { ...entry, dedupe_key: '' })).rejects.toThrow();
  });

  it('the same key for another user is a separate notification', async () => {
    await seedUser(OTHER_USER);
    expect(await insertDeduped(testDb(), entry)).not.toBeNull();
    expect(await insertDeduped(testDb(), { ...entry, user_id: OTHER_USER })).not.toBeNull();
    expect(await rowsOf('notifications')).toHaveLength(2);
  });

  it('two concurrent inserts of one key: exactly one wins', async () => {
    const results = await Promise.all([insertDeduped(testDb(), entry), insertDeduped(testDb(), entry)]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(await rowsOf('notifications')).toHaveLength(1);
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
