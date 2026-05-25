/** `GET /api/v1/me` and `PUT /api/v1/me/profile` response body. */
export type MeResponse = {
  id: string;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
  currency: string | null;
};
