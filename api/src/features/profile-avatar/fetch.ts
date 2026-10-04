import { BadRequestError } from '../../core/errors';
import { log } from '../../core/logging';
import { MAX_AVATAR_BYTES } from './schemas';

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'DimeAvatarFetcher/1.0';

/**
 * S1 (SSRF): the URL must be https, on the host allowlist, credential-free and on the default
 * port. Returns the normalized URL: the exact string that was validated is the one fetched, so
 * there is no parser differential between the check and the request.
 */
export function validateAvatarUrl(imageUrl: string, allowedHosts: readonly string[]): string {
  let url: URL;
  try {
    url = new URL(imageUrl.trim());
  } catch {
    throw new BadRequestError('Image URL is not allowed.');
  }
  const allowed = new Set(allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean));
  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    !allowed.has(url.hostname.toLowerCase()) ||
    url.username !== '' ||
    url.password !== '' ||
    (url.port !== '' && url.port !== '443')
  ) {
    throw new BadRequestError('Image URL is not allowed.');
  }
  return url.href;
}

/**
 * Download an allowlisted https image: redirects are never followed, the body is streamed with a
 * 5 MB cap and the response must declare `image/*`. Magic-byte validation of the returned bytes is
 * left to `uploadAvatar`.
 */
export async function fetchAvatarImage(
  imageUrl: string,
  allowedHosts: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const url = validateAvatarUrl(imageUrl, allowedHosts);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    log.warn('avatar_fetch_failed', { url, err: String(err) });
    throw new BadRequestError('Could not fetch selected avatar image.');
  }

  try {
    if (response.status !== 200) throw new BadRequestError('Could not fetch selected avatar image.');
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!contentType.startsWith('image/')) throw new BadRequestError('Selected URL is not an image.');
    const declared = response.headers.get('content-length') ?? '';
    if (/^\d+$/.test(declared) && Number(declared) > MAX_AVATAR_BYTES) throw new BadRequestError('Image too large.');
    return await readCapped(response, MAX_AVATAR_BYTES);
  } catch (err) {
    // Stop downloading as soon as we decided to reject.
    await response.body?.cancel().catch(() => undefined);
    if (err instanceof BadRequestError) throw err;
    log.warn('avatar_fetch_failed', { url, err: String(err) });
    throw new BadRequestError('Could not fetch selected avatar image.');
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BadRequestError('Image too large.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
