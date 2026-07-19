import { dimeApi } from "@/lib/api/dimeApi";

export async function putPushToken(token: string): Promise<void> {
  await dimeApi.put("/api/v1/me/push-token", {
    token,
    platform: "android",
  });
}

export async function deletePushToken(token?: string): Promise<void> {
  if (token) {
    await dimeApi.delete("/api/v1/me/push-token", {
      data: { token },
    });
    return;
  }

  await dimeApi.delete("/api/v1/me/push-token");
}

