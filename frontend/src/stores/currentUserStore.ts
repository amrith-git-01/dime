import { create } from "zustand";

import type { MeResponse } from "@/features/profile/types";
import {
  clearPersistedProfile,
  readPersistedProfile,
  writePersistedProfile,
} from "@/lib/profile/profileMmkv";

type CurrentUserState = {
  profile: MeResponse | null;
  setProfile: (profile: MeResponse | null) => void;
  clearProfile: () => void;
};

export const useCurrentUserStore = create<CurrentUserState>((set) => ({
  profile: readPersistedProfile(),
  setProfile: (profile) => {
    if (profile) {
      writePersistedProfile(profile);
    } else {
      clearPersistedProfile();
    }
    set({ profile });
  },
  clearProfile: () => {
    clearPersistedProfile();
    set({ profile: null });
  },
}));
