import * as Crypto from "expo-crypto";
import { createMMKV } from "react-native-mmkv";

const dedupeMmkv = createMMKV({ id: "dime-sms-dedupe" });
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

async function fingerprint(body: string, sender: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${sender.trim().toLowerCase()}|${body.trim()}`,
  );
}

/** Returns false when the same SMS was seen within the dedupe window. */
export async function shouldProcessSms(
  body: string,
  sender: string,
): Promise<boolean> {
  const key = await fingerprint(body, sender);
  const lastSeen = dedupeMmkv.getNumber(key);
  const now = Date.now();
  if (lastSeen != null && now - lastSeen < DEDUPE_WINDOW_MS) {
    return false;
  }
  dedupeMmkv.set(key, now);
  return true;
}
