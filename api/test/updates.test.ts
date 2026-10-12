import { env as workerEnv } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { USER_ID, makeEnv, testApp } from './helpers';

const ID = '11111111-2222-4333-8444-555555555555';
const ROLLBACK_ID = '99999999-2222-4333-8444-555555555555';
const HASH = 'A'.repeat(43);
const MANIFEST = JSON.stringify({ id: ID, createdAt: '2026-10-12T00:00:00.000Z', runtimeVersion: '1.0.0', assets: [] });
const SIGNATURE = 'sig="abc+/=", keyid="main", alg="rsa-v1_5-sha256"';

const HEADERS = {
  'expo-protocol-version': '1',
  'expo-platform': 'android',
  'expo-runtime-version': '1.0.0',
  'expo-channel-name': 'production',
  accept: 'multipart/mixed,application/expo+json,application/json',
};

const get = (path: string, headers: Record<string, string> = {}) => testApp().request(path, { headers }, makeEnv());
const manifest = (headers: Record<string, string> = {}) => get('/api/v1/updates/manifest', { ...HEADERS, ...headers });

async function publish(pointer: { type: string; id: string } = { type: 'update', id: ID }) {
  const bucket = workerEnv.MEDIA;
  await bucket.put('updates/production/1.0.0/android/latest.json', JSON.stringify(pointer));
  await bucket.put(`updates/builds/${ID}/manifest.json`, MANIFEST);
  await bucket.put(`updates/builds/${ID}/signature`, `${SIGNATURE}\n`);
  await bucket.put(`updates/builds/${ROLLBACK_ID}/directive.json`, '{"type":"rollBackToEmbedded","parameters":{"commitTime":"2026-10-12T00:00:00.000Z"}}');
  await bucket.put(`updates/builds/${ROLLBACK_ID}/signature`, SIGNATURE);
}

describe('GET /api/v1/updates/manifest', () => {
  it('serves the stored manifest bytes verbatim as multipart/mixed with the protocol headers', async () => {
    await publish();
    const res = await manifest();
    expect(res.status).toBe(200);
    expect(res.headers.get('expo-protocol-version')).toBe('1');
    expect(res.headers.get('expo-sfv-version')).toBe('0');
    expect(res.headers.get('cache-control')).toBe('private, max-age=0');
    const type = res.headers.get('content-type') ?? '';
    expect(type).toMatch(/^multipart\/mixed; boundary=/);
    const text = await res.text();
    expect(text).toContain('content-disposition: form-data; name="manifest"');
    expect(text).toContain(`\r\n\r\n${MANIFEST}\r\n--`);
    expect(text).toContain('name="extensions"');
    expect(text).not.toContain('expo-signature');
  });

  it('passes the stored signature through when the client expects one', async () => {
    await publish();
    const text = await (await manifest({ 'expo-expect-signature': 'sig, keyid="main", alg="rsa-v1_5-sha256"' })).text();
    expect(text).toContain(`expo-signature: ${SIGNATURE}\r\n\r\n${MANIFEST}`);
  });

  it('is a 204 with no body when the client already runs the latest update', async () => {
    await publish();
    const res = await manifest({ 'expo-current-update-id': ID.toUpperCase() });
    expect(res.status).toBe(204);
    expect(res.headers.get('expo-protocol-version')).toBe('1');
    expect(res.headers.get('content-type')).toBeNull();
    expect(await res.text()).toBe('');
  });

  it('is a 204 when nothing is published for the runtime, platform or channel', async () => {
    await publish();
    expect((await manifest({ 'expo-runtime-version': '2.0.0' })).status).toBe(204);
    expect((await manifest({ 'expo-platform': 'ios' })).status).toBe(204);
    expect((await manifest({ 'expo-channel-name': 'staging' })).status).toBe(204);
  });

  it('serves a rollBackToEmbedded directive for a rollback pointer', async () => {
    await publish({ type: 'rollback', id: ROLLBACK_ID });
    const text = await (await manifest({ 'expo-expect-signature': 'sig' })).text();
    expect(text).toContain('name="directive"');
    expect(text).toContain('"type":"rollBackToEmbedded"');
    expect(text).toContain(`expo-signature: ${SIGNATURE}`);
    expect(text).not.toContain('name="manifest"');
    const onEmbedded = await manifest({ 'expo-current-update-id': ID, 'expo-embedded-update-id': ID });
    expect(onEmbedded.status).toBe(204);
  });

  it('rejects missing or invalid headers with 400', async () => {
    for (const bad of <Record<string, string>[]>[
      { 'expo-protocol-version': '0' },
      { 'expo-protocol-version': '' },
      { 'expo-platform': 'web' },
      { 'expo-runtime-version': '' },
      { 'expo-runtime-version': '../../x' },
      { 'expo-channel-name': '' },
      { 'expo-channel-name': 'a/b' },
    ]) {
      const res = await manifest(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await manifest({ accept: 'application/json' })).status).toBe(406);
  });

  it('fails loudly when a signature is expected but the build has none', async () => {
    await publish();
    await workerEnv.MEDIA.delete(`updates/builds/${ID}/signature`);
    expect((await manifest({ 'expo-expect-signature': 'sig' })).status).toBe(503);
    expect((await manifest()).status).toBe(200);
  });
});

describe('GET /api/v1/updates/assets/:hash', () => {
  it('streams the object with its content type and immutable cache headers', async () => {
    await workerEnv.MEDIA.put(`updates/assets/${HASH}`, 'console.log(1)', { httpMetadata: { contentType: 'application/javascript' } });
    const res = await get(`/api/v1/updates/assets/${HASH}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/javascript');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await res.text()).toBe('console.log(1)');
  });

  it('is 404 for a missing or malformed hash', async () => {
    expect((await get(`/api/v1/updates/assets/${'B'.repeat(43)}`)).status).toBe(404);
    expect((await get('/api/v1/updates/assets/short')).status).toBe(404);
    expect((await get('/api/v1/updates/assets/..%2Fbuilds%2Fx')).status).toBe(404);
  });
});

describe('isolation from /media', () => {
  it('/media/* cannot serve the updates/ prefix', async () => {
    await workerEnv.MEDIA.put(`updates/assets/${HASH}`, 'x');
    await publish();
    for (const key of [`updates/assets/${HASH}`, `updates/builds/${ID}/manifest.json`, 'updates/production/1.0.0/android/latest.json']) {
      expect((await get(`/media/${key}`)).status, key).toBe(404);
    }
  });

  it('the assets route cannot read other prefixes', async () => {
    await workerEnv.MEDIA.put(`avatars/${USER_ID}/avatar.png`, 'x');
    expect((await get(`/api/v1/updates/assets/avatars%2F${USER_ID}`)).status).toBe(404);
  });
});
