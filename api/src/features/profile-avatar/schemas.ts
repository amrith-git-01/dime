import * as z from 'zod';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export const avatarFromUrlBodySchema = z.object({ image_url: z.string().max(2048) });

export interface AvatarUploadResponse {
  avatar_url: string;
}
