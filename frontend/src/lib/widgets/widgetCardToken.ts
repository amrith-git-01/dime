import { getRandomBytes } from "expo-crypto";
import { createMMKV } from "react-native-mmkv";

/**
 * A per-install secret the widget's buttons carry in their links (`dimecard://scan?t=...`). The card
 * activity is exported so the launcher can start it, which also lets any other app or web page send
 * `dimecard://` links: without the token the card asks before it does anything on its own (starts
 * recording, opens the camera). Created once, kept in the device-level settings store, readable in the
 * headless widget task. Not a credential: it never leaves the device, and it survives sign-out.
 */
const settingsMmkv = createMMKV({ id: "dime-settings" });

const CARD_TOKEN_KEY = "widget.card_token";
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getWidgetCardToken(): string {
  const stored = settingsMmkv.getString(CARD_TOKEN_KEY);
  if (stored && TOKEN_PATTERN.test(stored)) {
    return stored;
  }
  const token = toHex(getRandomBytes(16));
  settingsMmkv.set(CARD_TOKEN_KEY, token);
  return token;
}

export function isWidgetCardToken(candidate: string | null | undefined): boolean {
  return !!candidate && candidate === getWidgetCardToken();
}
