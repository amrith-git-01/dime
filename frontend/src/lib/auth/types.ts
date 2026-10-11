/** The session the API returns from `/auth/google` and `/auth/refresh`, stored as is. */
export type AuthSession = {
  access_token: string;
  token_type: string;
  expires_in: number;
  /** Unix seconds. */
  expires_at: number;
  refresh_token: string;
  user: { id: string; email: string | null };
};
