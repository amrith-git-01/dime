import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { createMMKV } from "react-native-mmkv";

import { reportError } from "@/lib/reportError";

import type { AuthSession } from "./types";

const ENCRYPTION_KEY_STORE_KEY = "dime.supabase-auth.mmkv-key";
const AUTH_MMKV_ID = "dime-auth-encrypted";
const SESSION_KEY = "dime.session";
/** Stores left by the Supabase-era app; their tokens are dead, so they are emptied once. */
const LEGACY_ENCRYPTED_MMKV_ID = "supabase-auth-encrypted";
const LEGACY_PLAIN_MMKV_ID = "supabase-auth";
/** Plain store holding the "legacy stores already emptied" flag; survives sign-out. */
const AUTH_META_MMKV_ID = "dime-auth-meta";
const LEGACY_CLEANED_KEY = "legacy_cleaned";

/** 16 random bytes as 32 hex chars = a 32-byte AES-256 key. Kept in the OS keystore, not in MMKV. */
function generateEncryptionKey(): string {
  return Array.from(getRandomBytes(16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function loadOrCreateEncryptionKey(): { key: string; isNew: boolean } {
  const existing = SecureStore.getItem(ENCRYPTION_KEY_STORE_KEY);
  if (existing) {
    return { key: existing, isNew: false };
  }
  const key = generateEncryptionKey();
  SecureStore.setItem(ENCRYPTION_KEY_STORE_KEY, key);
  return { key, isNew: true };
}

/** The slice of an MMKV instance this module uses. */
type AuthStore = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  clearAll(): void;
};

function openEncryptedStore(key: string): AuthStore {
  return createMMKV({
    id: AUTH_MMKV_ID,
    encryptionKey: key,
    encryptionType: "AES-256",
  });
}

/** Last resort when neither the keystore nor MMKV works: the session lasts until the app closes. */
function createMemoryStore(): AuthStore {
  const map = new Map<string, string>();
  return {
    getString: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
    clearAll: () => {
      map.clear();
    },
  };
}

/** Empties the Supabase-era stores, once per install (a flag in a plain store records it). */
function cleanLegacyStoresOnce(key: string): void {
  try {
    const meta = createMMKV({ id: AUTH_META_MMKV_ID });
    if (meta.getBoolean(LEGACY_CLEANED_KEY)) {
      return;
    }
    try {
      createMMKV({
        id: LEGACY_ENCRYPTED_MMKV_ID,
        encryptionKey: key,
        encryptionType: "AES-256",
      }).clearAll();
    } catch {
      // Nothing to clean up.
    }
    try {
      createMMKV({ id: LEGACY_PLAIN_MMKV_ID }).clearAll();
    } catch {
      // Nothing to clean up.
    }
    meta.set(LEGACY_CLEANED_KEY, true);
  } catch {
    // Clean-up is best effort; it must never block launch.
  }
}

/**
 * Opens the encrypted session store. This runs at import time, so it must never throw: a broken
 * keystore entry or an unreadable file would otherwise crash the app on every launch. On failure
 * the key is regenerated and the store cleared (the user signs in again); if even that fails, an
 * in-memory store keeps the app usable.
 */
function createAuthMmkv(): AuthStore {
  try {
    const { key, isNew } = loadOrCreateEncryptionKey();
    const encrypted = openEncryptedStore(key);
    if (isNew) {
      // A fresh key cannot decrypt anything left by an earlier install (e.g. restored backup).
      encrypted.clearAll();
    } else {
      encrypted.getString(SESSION_KEY); // throws now if the file cannot be read with this key
    }
    cleanLegacyStoresOnce(key);
    return encrypted;
  } catch (error) {
    reportError(error, "authStorage init failed, resetting the session store");
  }
  try {
    const key = generateEncryptionKey();
    SecureStore.setItem(ENCRYPTION_KEY_STORE_KEY, key);
    const encrypted = openEncryptedStore(key);
    encrypted.clearAll();
    return encrypted;
  } catch (error) {
    reportError(error, "authStorage reset failed, using memory store");
    return createMemoryStore();
  }
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
