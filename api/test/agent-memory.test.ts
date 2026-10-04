import { describe, expect, it } from 'vitest';

import { MEMORY_TTL_MS, signMemory, verifyMemory } from '../src/features/agent/memory';
import type { MemoryContent } from '../src/features/agent/memory';

const SECRET = 'a-memory-secret-that-is-long-enough';
const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const NOW = Date.parse('2026-10-05T10:00:00Z');

const content: MemoryContent = {
  time_range: { from: '2026-06-01', to: '2026-06-30', label: 'June 2026' },
  entities: [{ type: 'payee', id: 'swiggy', name: 'Swiggy' }],
  last_tools: ['spending_summary'],
  summary: 'Asked: spend at swiggy | Said: ₹1,200',
};

const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

describe('agent memory token', () => {
  it('round-trips: base64url payload and mac, bound to the user, valid for 24 hours', async () => {
    const token = await signMemory(SECRET, USER_A, content, NOW);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const memory = await verifyMemory(SECRET, token, USER_A, NOW + 1000);
    expect(memory).toMatchObject({ v: 1, user_id: USER_A, ...content, exp: Math.floor((NOW + MEMORY_TTL_MS) / 1000) });
  });

  it('rejects a different user (a token can never cross accounts)', async () => {
    const token = await signMemory(SECRET, USER_A, content, NOW);
    expect(await verifyMemory(SECRET, token, USER_B, NOW)).toBeNull();
  });

  it('rejects an expired token (24 h) and accepts it just before', async () => {
    const token = await signMemory(SECRET, USER_A, content, NOW);
    expect(await verifyMemory(SECRET, token, USER_A, NOW + MEMORY_TTL_MS - 2000)).not.toBeNull();
    expect(await verifyMemory(SECRET, token, USER_A, NOW + MEMORY_TTL_MS + 1000)).toBeNull();
  });

  it('rejects a tampered payload even when the signature is kept', async () => {
    const token = await signMemory(SECRET, USER_A, content, NOW);
    const [payload, mac] = token.split('.') as [string, string];
    const forged = JSON.parse(decode(payload)) as Record<string, unknown>;
    forged['user_id'] = USER_B;
    const forgedExp = { ...forged, exp: (forged['exp'] as number) + 99_999 };
    expect(await verifyMemory(SECRET, `${b64url(JSON.stringify(forged))}.${mac}`, USER_B, NOW)).toBeNull();
    expect(await verifyMemory(SECRET, `${b64url(JSON.stringify(forgedExp))}.${mac}`, USER_A, NOW)).toBeNull();
  });

  it('rejects a tampered or wrong signature and a different secret', async () => {
    const token = await signMemory(SECRET, USER_A, content, NOW);
    const [payload, mac] = token.split('.') as [string, string];
    const flipped = `${mac.slice(0, -1)}${mac.endsWith('A') ? 'B' : 'A'}`;
    expect(await verifyMemory(SECRET, `${payload}.${flipped}`, USER_A, NOW)).toBeNull();
    expect(await verifyMemory('another-secret-another-secret', token, USER_A, NOW)).toBeNull();
  });

  it('treats malformed input as no memory', async () => {
    for (const bad of [undefined, null, '', 'nodot', 'a.b.c', '.', 'abc.', '.abc', '%%%.%%%', 'x'.repeat(5000)]) {
      expect(await verifyMemory(SECRET, bad, USER_A, NOW)).toBeNull();
    }
    // A correctly signed payload that is not a memory object.
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const payload = b64url(JSON.stringify({ hello: 'world' }));
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
    const macText = btoa(String.fromCharCode(...mac)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await verifyMemory(SECRET, `${payload}.${macText}`, USER_A, NOW)).toBeNull();
  });

  it('keeps the token small: summary is cut to 300 characters and lists are capped', async () => {
    const token = await signMemory(SECRET, USER_A, { ...content, summary: 'x'.repeat(900), entities: Array.from({ length: 12 }, (_, i) => ({ type: 'payee' as const, id: `p${i}`, name: `P${i}` })), last_tools: Array.from({ length: 12 }, () => 'spending_summary') }, NOW);
    const memory = await verifyMemory(SECRET, token, USER_A, NOW);
    expect(memory?.summary).toHaveLength(300);
    expect(memory?.entities).toHaveLength(6);
    expect(memory?.last_tools).toHaveLength(6);
    expect(token.length).toBeLessThan(2000);
  });
});
