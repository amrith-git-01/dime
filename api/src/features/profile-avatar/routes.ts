import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import { MULTIPART_ENVELOPE_BYTES, limitBody } from '../../core/body-limit';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { PayloadTooLargeError } from '../../core/errors';
import { rateLimit } from '../../core/rate-limit';
import { getSupabase } from '../../core/supabase';
import { unprocessable, validate } from '../../core/validation';
import { fetchAvatarImage } from './fetch';
import { MAX_AVATAR_BYTES, avatarFromUrlBodySchema } from './schemas';
import type { AvatarUploadResponse } from './schemas';
import { uploadAvatar } from './service';

/** Mounted at `/profile`. */
export const profileAvatarRoutes = new Hono<AppBindings>();

profileAvatarRoutes.use(requireAuth);

profileAvatarRoutes.post(
  '/avatar',
  rateLimit('WRITE_LIMITER'),
  limitBody(MAX_AVATAR_BYTES + MULTIPART_ENVELOPE_BYTES),
  async (c) => {
    const missing = () => unprocessable([{ type: 'missing', loc: ['body', 'file'], msg: 'Field required' }]);
    const contentType = c.req.header('content-type') ?? '';
    if (!/^multipart\/form-data/i.test(contentType)) return missing();
    let form: Record<string, unknown>;
    try {
      form = await c.req.parseBody();
    } catch {
      return missing();
    }
    const file = form['file'];
    if (!(file instanceof File)) return missing();
    if (file.size > MAX_AVATAR_BYTES) {
      throw new PayloadTooLargeError(`File too large (max ${MAX_AVATAR_BYTES / (1024 * 1024)} MB).`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const url = await uploadAvatar(getSupabase(c), {
      userId: currentUser(c).id,
      bytes,
      bucket: getConfig(c.env).storageBucket,
    });
    return c.json({ avatar_url: url } satisfies AvatarUploadResponse);
  },
);

profileAvatarRoutes.post('/avatar/from-url', rateLimit('WRITE_LIMITER'), validate('json', avatarFromUrlBodySchema), async (c) => {
  const config = getConfig(c.env);
  const bytes = await fetchAvatarImage(c.req.valid('json').image_url, config.avatarUrlAllowedHosts);
  const url = await uploadAvatar(getSupabase(c), {
    userId: currentUser(c).id,
    bytes,
    bucket: config.storageBucket,
  });
  return c.json({ avatar_url: url } satisfies AvatarUploadResponse);
});
