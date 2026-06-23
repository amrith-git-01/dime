import { createMMKV } from "react-native-mmkv";

const settingsMmkv = createMMKV({ id: "dime-settings" });

function watermarkKey(userId: string): string {
  return `capture.sms_watermark_ms:${userId}`;
}

export function getSmsWatermarkMs(userId: string): number | null {
  const key = watermarkKey(userId);
  if (!settingsMmkv.contains(key)) {
    return null;
  }
  const value = settingsMmkv.getNumber(key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function setSmsWatermarkMs(userId: string, dateMs: number): void {
  settingsMmkv.set(watermarkKey(userId), dateMs);
}

/** First successful READ_SMS grant: cursor = now, no inbox backfill. */
export function ensureSmsWatermarkOnFirstGrant(
  userId: string,
  nowMs: number = Date.now(),
): number {
  const existing = getSmsWatermarkMs(userId);
  if (existing != null) {
    return existing;
  }
  setSmsWatermarkMs(userId, nowMs);
  return nowMs;
}
