import * as z from 'zod';

export const googleBodySchema = z.object({ id_token: z.string().min(1).max(8192) });
export const refreshBodySchema = z.object({ refresh_token: z.string().min(1).max(512) });
export const signOutBodySchema = z.object({
  scope: z.enum(['global', 'local']).default('local'),
  refresh_token: z.string().min(1).max(512).optional(),
});

/** Shape the app's encrypted session store keeps: `{ access_token, refresh_token, expires_at, user }`. */
export interface SessionResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  /** Unix seconds. */
  expires_at: number;
  refresh_token: string;
  user: { id: string; email: string | null };
}

export interface SessionRow {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: string;
  revoked_at: string | null;
  replaced_by: string | null;
}
