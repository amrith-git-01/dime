import type { Session } from "@supabase/supabase-js";
import { createMMKV } from "react-native-mmkv";

const authMmkv = createMMKV({ id: "supabase-auth" });

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
