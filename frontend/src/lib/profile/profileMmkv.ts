import { createMMKV } from "react-native-mmkv";

import type { MeResponse } from "@/features/profile/types";

const profileMmkv = createMMKV({ id: "user-profile" });
const PROFILE_KEY = "dime:profile";

/** Synchronous read of the last known `/me` response (no network). */
export function readPersistedProfile(): MeResponse | null {
  const raw = profileMmkv.getString(PROFILE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const profile = JSON.parse(raw) as MeResponse;
    if (!profile?.id) {
      return null;
    }
    return profile;
  } catch {
    return null;
  }
}

export function writePersistedProfile(profile: MeResponse): void {
  profileMmkv.set(PROFILE_KEY, JSON.stringify(profile));
}

export function clearPersistedProfile(): void {
  profileMmkv.remove(PROFILE_KEY);
}
