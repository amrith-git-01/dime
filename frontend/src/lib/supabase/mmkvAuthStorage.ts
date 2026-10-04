import type { Session } from "@supabase/supabase-js";
import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { createMMKV } from "react-native-mmkv";

const ENCRYPTION_KEY_STORE_KEY = "dime.supabase-auth.mmkv-key";
const LEGACY_AUTH_MMKV_ID = "supabase-auth";
const AUTH_MMKV_ID = "supabase-auth-encrypted";

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
  }

  // One-time migration: move a session saved by the old unencrypted store so the user stays signed in.
  const legacy = createMMKV({ id: LEGACY_AUTH_MMKV_ID });
  const legacyKeys = legacy.getAllKeys();
  if (legacyKeys.length > 0) {
    for (const legacyKey of legacyKeys) {
      const value = legacy.getString(legacyKey);
      if (value !== undefined && !encrypted.contains(legacyKey)) {
        encrypted.set(legacyKey, value);
      }
    }
    legacy.clearAll();
  }
  return encrypted;
}

const authMmkv = createAuthMmkv();

function findAuthTokenStorageKey(): string | undefined {
  return authMmkv.getAllKeys().find((key) => key.endsWith("-auth-token"));
}

/** Synchronous read of the persisted Supabase session (no network). */
export function readStoredAuthSession(): Session | null {
  const key = findAuthTokenStorageKey();
  if (!key) {
    return null;
  }

  const raw = authMmkv.getString(key);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as Session;
    if (!session?.access_token || !session.user?.id) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export const supabaseAuthMmkvStorage = {
  getItem: (key: string): Promise<string | null> => {
    const value = authMmkv.getString(key);
    return Promise.resolve(value ?? null);
  },
  setItem: (key: string, value: string): Promise<void> => {
    authMmkv.set(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    authMmkv.remove(key);
    return Promise.resolve();
  },
};

/** Clears every key in the Supabase auth MMKV instance (use after `signOut` if you want no leftovers). */
export function clearSupabaseAuthMmkv(): void {
  authMmkv.clearAll();
}
