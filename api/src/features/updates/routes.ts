import { Hono } from 'hono';

import type { AppBindings } from '../../core/env';
import { AppError, BadRequestError, NotFoundError, ServiceUnavailableError } from '../../core/errors';
import { rateLimit } from '../../core/rate-limit';
import {
  ASSET_HASH_RE,
  CHANNEL_RE,
  PLATFORMS,
  RUNTIME_VERSION_RE,
  assetKey,
  buildKey,
  pointerKey,
  readPointer,
  type Platform,
} from './storage';

/**
 * Self-hosted expo-updates server, protocol v1 (https://docs.expo.dev/technical-specs/expo-updates-1/).
 * Public, no auth: the manifest and its signature are precomputed on the developer machine at publish time and
 * returned verbatim, so the Worker never holds the signing key and the app (code signing) rejects anything else.
 */
export const updatesRoutes = new Hono<AppBindings>();

const encoder = new TextEncoder();

/** Headers every protocol response carries. `private, max-age=0`: the answer depends on the client's current update. */
const PROTOCOL_HEADERS = {
  'expo-protocol-version': '1',
  'expo-sfv-version': '0',
  'cache-control': 'private, max-age=0',
};

function acceptsMultipart(accept: string | undefined): boolean {
  if (!accept) return true;
  return /multipart\/mixed|multipart\/\*|\*\/\*/i.test(accept);
}

function part(name: string, contentType: string, body: Uint8Array, extraHeaders: Record<string, string> = {}): Uint8Array[] {
  const head = [
    `content-disposition: form-data; name="${name}"`,
    `content-type: ${contentType}`,
    ...Object.entries(extraHeaders).map(([k, v]) => `${k}: ${v}`),
  ].join('\r\n');
  return [encoder.encode(`${head}\r\n\r\n`), body, encoder.encode('\r\n')];
}

/** Assembles the parts by hand so the signed manifest bytes reach the client untouched. */
function multipart(parts: Uint8Array[][]): { body: Uint8Array; boundary: string } {
  const boundary = `dime-${crypto.randomUUID()}`;
  const chunks: Uint8Array[] = [];
  for (const p of parts) chunks.push(encoder.encode(`--${boundary}\r\n`), ...p);
  chunks.push(encoder.encode(`--${boundary}--\r\n`));
  const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    body.set(c, at);
    at += c.length;
  }
  return { body, boundary };
}

/** Protocol v1 no-op: a 204 with no body and no content-type. */
const noContent = () => new Response(null, { status: 204, headers: PROTOCOL_HEADERS });

updatesRoutes.get('/manifest', rateLimit('WRITE_LIMITER'), async (c) => {
  const h = c.req.header.bind(c.req);
  if (h('expo-protocol-version') !== '1') throw new BadRequestError('Unsupported expo-protocol-version (expected 1).');
  const platform = h('expo-platform');
  if (!platform || !(PLATFORMS as readonly string[]).includes(platform)) throw new BadRequestError('Unsupported expo-platform.');
  const runtimeVersion = h('expo-runtime-version');
  if (!runtimeVersion || !RUNTIME_VERSION_RE.test(runtimeVersion)) throw new BadRequestError('Missing or invalid expo-runtime-version.');
  const channel = h('expo-channel-name');
  if (!channel || !CHANNEL_RE.test(channel)) throw new BadRequestError('Missing or invalid expo-channel-name.');
  if (!acceptsMultipart(h('accept'))) throw new AppError(406, 'Only multipart/mixed responses are supported.');

  const bucket = c.env.MEDIA;
  const pointer = await readPointer(bucket, pointerKey(channel, runtimeVersion, platform as Platform));
  if (!pointer) return noContent();

  const currentId = h('expo-current-update-id')?.toLowerCase();
  if (pointer.type === 'update' && currentId === pointer.id) return noContent();
  const embeddedId = h('expo-embedded-update-id')?.toLowerCase();
  // Already running the embedded update: nothing to roll back to.
  if (pointer.type === 'rollback' && currentId && currentId === embeddedId) return noContent();

  const isUpdate = pointer.type === 'update';
  const wantsSignature = Boolean(h('expo-expect-signature'));
  const [body, signature] = await Promise.all([
    bucket.get(buildKey(pointer.id, isUpdate ? 'manifest.json' : 'directive.json')),
    wantsSignature ? bucket.get(buildKey(pointer.id, 'signature')) : Promise.resolve(null),
  ]);
  if (!body) throw new ServiceUnavailableError('Published update is incomplete.');
  if (wantsSignature && !signature) throw new ServiceUnavailableError('Published update is not signed.');
  const signatureHeader = signature ? (await signature.text()).trim() : null;

  const bytes = new Uint8Array(await body.arrayBuffer());
  const signed: Record<string, string> = signatureHeader ? { 'expo-signature': signatureHeader } : {};
  const parts = isUpdate
    ? [
        part('manifest', 'application/json; charset=utf-8', bytes, signed),
        part('extensions', 'application/json', encoder.encode(JSON.stringify({ assetRequestHeaders: {} }))),
      ]
    : [part('directive', 'application/json; charset=utf-8', bytes, signed)];
  const { body: payload, boundary } = multipart(parts);
  return new Response(payload, {
    headers: { ...PROTOCOL_HEADERS, 'content-type': `multipart/mixed; boundary=${boundary}` },
  });
});

/** Content-addressed assets: the key is the SHA-256 (base64url), so the bytes under a URL never change. */
updatesRoutes.get('/assets/:hash', async (c) => {
  const hash = c.req.param('hash');
  if (!ASSET_HASH_RE.test(hash)) throw new NotFoundError();
  const object = await c.env.MEDIA.get(assetKey(hash), { onlyIf: c.req.raw.headers });
  if (!object) throw new NotFoundError();
  const headers = {
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    etag: object.httpEtag,
  };
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, {
    headers: { ...headers, 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
  });
});
