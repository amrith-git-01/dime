import { create } from "zustand";

/** True while Google sign-in is in flight (blocks nav + /me until done). */
export const useGoogleAuthGate = create<{
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
}>((set) => ({
  isPending: false,
  setIsPending: (isPending) => set({ isPending }),
}));
