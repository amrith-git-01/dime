import { dimeApi } from "@/lib/api/dimeApi";

export async function putPushToken(token: string): Promise<void> {
  await dimeApi.put("/api/v1/me/push-token", {
    token,
    platform: "android",
  });
}

/** `options.authorization`/`timeoutMs`: for sign-out, where the session is already cleared locally. */
export async function deletePushToken(
  token?: string,
  options?: { authorization?: string; timeoutMs?: number },
): Promise<void> {
  await dimeApi.delete("/api/v1/me/push-token", {
    data: token ? { token } : {},
    ...(options?.authorization
      ? { headers: { Authorization: options.authorization } }
      : {}),
    ...(options?.timeoutMs ? { timeout: options.timeoutMs } : {}),
  });
}

