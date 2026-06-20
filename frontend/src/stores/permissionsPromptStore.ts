import { create } from "zustand";

/** True after a successful Google sign-in until the permissions setup screen is finished. */
export const usePermissionsPromptStore = create<{
  pendingAfterGoogleSignIn: boolean;
  markPendingAfterGoogleSignIn: () => void;
  clearPendingAfterGoogleSignIn: () => void;
}>((set) => ({
  pendingAfterGoogleSignIn: false,
  markPendingAfterGoogleSignIn: () => set({ pendingAfterGoogleSignIn: true }),
  clearPendingAfterGoogleSignIn: () => set({ pendingAfterGoogleSignIn: false }),
}));
