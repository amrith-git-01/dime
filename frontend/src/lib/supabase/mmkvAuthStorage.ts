import { createMMKV } from "react-native-mmkv";

const authMmkv = createMMKV({ id: "supabase-auth" });

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
