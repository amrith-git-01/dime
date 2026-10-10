import * as z from 'zod';

/** `GET /me` and `PUT /me/profile` response. Unset fields are `null` (Pydantic dumped them). */
export interface MeResponse {
  id: string;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
  currency: string | null;
}

export const profileUpdateBodySchema = z.object({
  username: z.string().trim().min(3).max(20),
  currency: z.string().min(1).max(10).default('INR'),
  avatar_url: z.string().max(2048).nullish(),
});

export type ProfileUpdateBody = z.infer<typeof profileUpdateBodySchema>;

/** `public.users` columns this feature reads. */
export interface UserRow {
  id: string;
  username: string | null;
  avatar_url: string | null;
  currency: string | null;
  email: string | null;
}

export const USER_COLUMNS = 'id,username,avatar_url,currency,email';
