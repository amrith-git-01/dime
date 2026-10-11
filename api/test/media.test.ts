import { env as workerEnv } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { isValidMediaKey, storedMediaKey } from '../src/features/media/refs';
import {
  deleteMediaQuietly,
  downloadMedia,
  mediaStore,
  signMediaKey,
  signMediaUrls,
  uploadMedia,
  verifyMediaSignature,
} from '../src/features/media/storage';
import { USER_ID, makeEnv, testApp } from './helpers';

const BODY = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 5, 6, 7]);
const RECEIPT = `receipts/${USER_ID}/receipts/2026-10-04/1-abcd1234.jpg`;
const AVATAR = `avatars/${USER_ID}/avatar.png`;

const store = () => mediaStore(makeEnv());
const get = (path: string, init: RequestInit = {}) => testApp().request(path, init, makeEnv());
const pathOf = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

async function putReceipt() {
  await workerEnv.MEDIA.put(RECEIPT, BODY, { httpMetadata: { contentType: 'image/jpeg' } });
}

describe('storage roundtrip', () => {
  it('uploadMedia writes under the user prefix with the content type; downloadMedia reads it back', async () => {
    const key = await uploadMedia(store(), { userId: USER_ID, kind: 'receipts', bytes: BODY, contentType: 'image/jpeg', extension: 'jpg' });
    expect(key.startsWith(`receipts/${USER_ID}/receipts/`)).toBe(true);
    expect((await workerEnv.MEDIA.head(key))?.httpMetadata?.contentType).toBe('image/jpeg');
    expect(await downloadMedia(store(), key)).toEqual(BODY);
  });

  it('downloadMedia of a missing key is an upstream error', async () => {
    await expect(downloadMedia(store(), 'receipts/nope.jpg')).rejects.toMatchObject({ status: 502 });
  });

  it('deleteMediaQuietly removes the object and never throws, even for a missing key or a failing bucket', async () => {
    const key = await uploadMedia(store(), { userId: USER_ID, kind: 'voice_inputs', bytes: BODY, contentType: 'audio/mp4', extension: 'm4a' });
    await deleteMediaQuietly(store(), key);
    expect(await workerEnv.MEDIA.head(key)).toBeNull();
    await expect(deleteMediaQuietly(store(), 'receipts/missing.jpg')).resolves.toBeUndefined();
    const broken = { ...store(), bucket: { delete: () => Promise.reject(new Error('boom')) } as unknown as R2Bucket };
    await expect(deleteMediaQuietly(broken, key)).resolves.toBeUndefined();
  });
});

describe('signing', () => {
  it('signMediaUrls: local signing, deduped per key, null for unusable refs and when no secret is set', async () => {
    const legacy = 'https://x.supabase.co/storage/v1/object/sign/Dime-private/receipts/u/old.jpg?token=t';
    const out = await signMediaUrls(store(), [RECEIPT, RECEIPT, legacy, 'https://evil.example.com/a.jpg', '', null, undefined], { expiresIn: 60 });
    expect([...out.keys()]).toEqual([RECEIPT, legacy, 'https://evil.example.com/a.jpg']);
    expect(new URL(out.get(RECEIPT) ?? '').pathname).toBe(`/media/${RECEIPT}`);
    expect(new URL(out.get(legacy) ?? '').pathname).toBe('/media/receipts/u/old.jpg');
    expect(out.get('https://evil.example.com/a.jpg')).toBeNull();

    const noSecret = await signMediaUrls(mediaStore(makeEnv({ MEDIA_URL_SECRET: '' })), [RECEIPT], { expiresIn: 60 });
    expect(noSecret.get(RECEIPT)).toBeNull();
  });

  it('verifyMediaSignature accepts only the exact key, expiry and secret', async () => {
    const link = new URL(await signMediaKey(store(), RECEIPT, 60));
    const exp = Number(link.searchParams.get('exp'));
    const sig = link.searchParams.get('sig') ?? '';
    const secret = store().secret ?? '';
    expect(await verifyMediaSignature(secret, RECEIPT, exp, sig)).toBe(true);
    expect(await verifyMediaSignature(secret, `${RECEIPT}x`, exp, sig)).toBe(false);
    expect(await verifyMediaSignature(secret, RECEIPT, exp + 1, sig)).toBe(false);
    expect(await verifyMediaSignature('other-secret', RECEIPT, exp, sig)).toBe(false);
    expect(await verifyMediaSignature(secret, RECEIPT, exp, 'zz')).toBe(false);
    expect(await verifyMediaSignature(secret, RECEIPT, exp, sig.slice(2))).toBe(false);
  });
});

describe('GET /media/* private objects', () => {
  it('serves a validly signed link with the stored content type and a private cache lifetime', async () => {
    await putReceipt();
    const url = await signMediaKey(store(), RECEIPT, 600);
    const res = await get(pathOf(url));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toMatch(/^private, max-age=(59\d|600)$/);
    expect(res.headers.get('etag')).toBeTruthy();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BODY);
  });

  it('HEAD works and returns no body', async () => {
    await putReceipt();
    const res = await get(pathOf(await signMediaKey(store(), RECEIPT, 600)), { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe(String(BODY.byteLength));
    expect(await res.text()).toBe('');
  });

  it('403 for an expired link', async () => {
    await putReceipt();
    const url = await signMediaKey(store(), RECEIPT, 60, Date.now() - 3_600_000);
    expect((await get(pathOf(url))).status).toBe(403);
  });

  it('403 for a tampered key, tampered signature, tampered expiry, and missing parameters', async () => {
    await putReceipt();
    await workerEnv.MEDIA.put(`receipts/${USER_ID}/other.jpg`, BODY);
    const link = new URL(await signMediaKey(store(), RECEIPT, 600));
    const exp = link.searchParams.get('exp') ?? '';
    const sig = link.searchParams.get('sig') ?? '';

    expect((await get(`/media/receipts/${USER_ID}/other.jpg?exp=${exp}&sig=${sig}`)).status).toBe(403);
    const flipped = (sig[0] === '0' ? '1' : '0') + sig.slice(1);
    expect((await get(`${link.pathname}?exp=${exp}&sig=${flipped}`)).status).toBe(403);
    expect((await get(`${link.pathname}?exp=${Number(exp) + 3600}&sig=${sig}`)).status).toBe(403);
    expect((await get(`${link.pathname}?exp=${exp}`)).status).toBe(403);
    expect((await get(link.pathname)).status).toBe(403);
    expect((await get(`${link.pathname}?exp=abc&sig=${sig}`)).status).toBe(403);
  });

  it('404 for a validly signed link to a missing object', async () => {
    const url = await signMediaKey(store(), RECEIPT, 600);
    expect((await get(pathOf(url))).status).toBe(404);
  });

  it('503 when the deployment has no MEDIA_URL_SECRET', async () => {
    const res = await testApp().request(`/media/${RECEIPT}?exp=9999999999&sig=ab`, {}, makeEnv({ MEDIA_URL_SECRET: '' }));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('MEDIA_URL_SECRET');
  });
});

describe('GET /media/* avatars', () => {
  it('is public, cached for a day, and immutable when the URL carries a version', async () => {
    await workerEnv.MEDIA.put(AVATAR, PNG, { httpMetadata: { contentType: 'image/png' } });
    const plain = await get(`/media/${AVATAR}`);
    expect(plain.status).toBe(200);
    expect(plain.headers.get('content-type')).toBe('image/png');
    expect(plain.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(new Uint8Array(await plain.arrayBuffer())).toEqual(PNG);

    const versioned = await get(`/media/${AVATAR}?v=123`);
    expect(versioned.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('answers 304 to a matching If-None-Match', async () => {
    await workerEnv.MEDIA.put(AVATAR, PNG, { httpMetadata: { contentType: 'image/png' } });
    const first = await get(`/media/${AVATAR}`);
    const etag = first.headers.get('etag') ?? '';
    expect(etag).not.toBe('');
    const again = await get(`/media/${AVATAR}`, { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
    expect(again.headers.get('etag')).toBe(etag);
    expect(await again.text()).toBe('');
    expect((await get(`/media/${AVATAR}`, { headers: { 'if-none-match': '"other"' } })).status).toBe(200);
  });

  it('404 for a missing avatar', async () => {
    expect((await get(`/media/avatars/${USER_ID}/none.png`)).status).toBe(404);
  });
});

describe('GET /media/* rejects bad paths and methods', () => {
  it('path traversal, empty paths and unknown prefixes never reach the bucket', async () => {
    await workerEnv.MEDIA.put('secrets/x.txt', BODY);
    await putReceipt();
    for (const path of [
      '/media/',
      '/media/avatars',
      '/media/secrets/x.txt',
      '/media/avatars/../secrets/x.txt',
      '/media/avatars/%2e%2e/secrets/x.txt',
      '/media/avatars%2F..%2Fsecrets%2Fx.txt',
      '/media/avatars//a.png',
      '/media/avatars/%ZZ',
      '/media/avatars/a%5Cb.png',
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
    }
  });

  it('only GET and HEAD', async () => {
    const res = await get(`/media/${AVATAR}`, { method: 'PUT', body: PNG });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
    expect(await workerEnv.MEDIA.head(AVATAR)).toBeNull();
    expect((await get(`/media/${AVATAR}`, { method: 'DELETE' })).status).toBe(405);
  });

  it('needs no Authorization header and adds no no-store to private responses', async () => {
    await putReceipt();
    const res = await get(pathOf(await signMediaKey(store(), RECEIPT, 600)));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).not.toContain('no-store');
  });
});

describe('media refs', () => {
  it('treats bare paths as keys and parses legacy Supabase URLs in every flavour', () => {
    expect(storedMediaKey(RECEIPT)).toBe(RECEIPT);
    expect(storedMediaKey(`/${RECEIPT}`)).toBe(RECEIPT);
    expect(storedMediaKey(`https://p.supabase.co/storage/v1/object/public/Dime/${AVATAR}?v=1`)).toBe(AVATAR);
    expect(storedMediaKey(`https://p.supabase.co/storage/v1/object/authenticated/Dime-private/${RECEIPT}`)).toBe(RECEIPT);
    expect(storedMediaKey(`https://p.supabase.co/storage/v1/object/sign/Dime-private/${RECEIPT}?token=abc`)).toBe(RECEIPT);
    expect(storedMediaKey(`https://api.example.dev/media/${AVATAR}?v=2`)).toBe(AVATAR);
  });

  it('rejects unusable refs', () => {
    for (const bad of ['', '  ', 'notes/a.txt', 'receipts/../x.jpg', 'https://evil.example.com/receipts/a.jpg', 'https://p.supabase.co/storage/v1/object/public/Dime/other/a.jpg']) {
      expect(storedMediaKey(bad), bad).toBeNull();
    }
  });

  it('isValidMediaKey checks prefix and segments', () => {
    expect(isValidMediaKey(RECEIPT)).toBe(true);
    expect(isValidMediaKey('receipts/')).toBe(false);
    expect(isValidMediaKey('receipts//a')).toBe(false);
    expect(isValidMediaKey('receipts/./a')).toBe(false);
    expect(isValidMediaKey('voice_inputs/a/../b')).toBe(false);
    expect(isValidMediaKey('receipts/a\u0001b')).toBe(false);
  });
});
