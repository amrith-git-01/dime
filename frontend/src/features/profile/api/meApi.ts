import { dimeApi } from "@/lib/api/dimeApi";

import type { MeResponse } from "../types";

/**
 * The profile check gates the first screen, so it must not wait out the client's long default
 * timeout on a bad connection.
 */
export const ME_REQUEST_TIMEOUT_MS = 10_000;

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await dimeApi.get<MeResponse>("/api/v1/me", {
    timeout: ME_REQUEST_TIMEOUT_MS,
  });
  return data;
}

export type PutProfilePayload = {
  username: string;
  currency: string;
  avatar_url?: string;
};

export async function putProfile(
  payload: PutProfilePayload,
): Promise<MeResponse> {
  const body: Record<string, unknown> = {
    username: payload.username.trim(),
    currency: payload.currency.trim(),
  };
  if (payload.avatar_url != null && payload.avatar_url.trim() !== "") {
    body.avatar_url = payload.avatar_url.trim();
  }
  const { data } = await dimeApi.put<MeResponse>("/api/v1/me/profile", body);
  return data;
}
