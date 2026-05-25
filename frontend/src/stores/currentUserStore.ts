import { create } from "zustand";

import type { MeResponse } from "@/features/profile/types";

type CurrentUserState = {
  profile: MeResponse | null;
  setProfile: (profile: MeResponse | null) => void;
  clearProfile: () => void;
};

export const useCurrentUserStore = create<CurrentUserState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  clearProfile: () => set({ profile: null }),
}));
