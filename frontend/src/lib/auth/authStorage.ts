import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { createMMKV } from "react-native-mmkv";

import type { AuthSession } from "./types";

const ENCRYPTION_KEY_STORE_KEY = "dime.supabase-auth.mmkv-key";
const AUTH_MMKV_ID = "dime-auth-encrypted";
const SESSION_KEY = "dime.session";
/** Stores left by the Supabase-era app; their tokens are dead, so they are emptied once. */
const LEGACY_ENCRYPTED_MMKV_ID = "supabase-auth-encrypted";
const LEGACY_PLAIN_MMKV_ID = "supabase-auth";

/** 16 random bytes as 32 hex chars = a 32-byte AES-256 key. Kept in the OS keystore, not in MMKV. */
function loadOrCreateEncryptionKey(): { key: string; isNew: boolean } {
  const existing = SecureStore.getItem(ENCRYPTION_KEY_STORE_KEY);
  if (existing) {
    return { key: existing, isNew: false };
  }
  const key = Array.from(getRandomBytes(16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  SecureStore.setItem(ENCRYPTION_KEY_STORE_KEY, key);
  return { key, isNew: true };
}

function createAuthMmkv() {
  const { key, isNew } = loadOrCreateEncryptionKey();
  const encrypted = createMMKV({
    id: AUTH_MMKV_ID,
    encryptionKey: key,
    encryptionType: "AES-256",
  });
  if (isNew) {
    // A fresh key cannot decrypt anything left by an earlier install (e.g. restored backup).
    encrypted.clearAll();
  } else {
    try {
      createMMKV({
        id: LEGACY_ENCRYPTED_MMKV_ID,
        encryptionKey: key,
        encryptionType: "AES-256",
      }).clearAll();
    } catch {
      // Nothing to clean up.
    }
  }
  try {
    createMMKV({ id: LEGACY_PLAIN_MMKV_ID }).clearAll();
  } catch {
    // Nothing to clean up.
  }
  return encrypted;
}

const authMmkv = createAuthMmkv();

function isSession(value: unknown): value is AuthSession {
  const s = value as Partial<AuthSession> | null;
  return (
    !!s &&
    typeof s.access_token === "string" &&
    typeof s.refresh_token === "string" &&
    typeof s.expires_at === "number" &&
    typeof s.user?.id === "string"
  );
}

/** Synchronous read of the persisted session (no network). */
export function readStoredAuthSession(): AuthSession | null {
  const raw = authMmkv.getString(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    const session: unknown = JSON.parse(raw);
    return isSession(session) ? session : null;
  } catch {
    return null;
  }
}

export function writeStoredAuthSession(session: AuthSession): void {
  authMmkv.set(SESSION_KEY, JSON.stringify(session));
}

/** Removes the persisted session. */
export function clearStoredAuthSession(): void {
  authMmkv.clearAll();
}
