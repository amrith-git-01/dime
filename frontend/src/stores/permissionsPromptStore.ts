import { create } from "zustand";

/** True after Google sign-in until Home shows native permission dialogs. */
export const usePermissionsPromptStore = create<{
  pendingAfterGoogleSignIn: boolean;
  markPendingAfterGoogleSignIn: () => void;
  clearPendingAfterGoogleSignIn: () => void;
}>((set) => ({
  pendingAfterGoogleSignIn: false,
  markPendingAfterGoogleSignIn: () => set({ pendingAfterGoogleSignIn: true }),
  clearPendingAfterGoogleSignIn: () => set({ pendingAfterGoogleSignIn: false }),
}));
