import { create } from "zustand";

/** True after Google sign-in until Home shows native permission dialogs. */
export const usePermissionsPromptStore = create<{
  pendingAfterGoogleSignIn: boolean;
  /** True while the native permission dialogs are on screen. */
  prompting: boolean;
  markPendingAfterGoogleSignIn: () => void;
  clearPendingAfterGoogleSignIn: () => void;
  setPrompting: (prompting: boolean) => void;
}>((set) => ({
  pendingAfterGoogleSignIn: false,
  prompting: false,
  markPendingAfterGoogleSignIn: () => set({ pendingAfterGoogleSignIn: true }),
  clearPendingAfterGoogleSignIn: () => set({ pendingAfterGoogleSignIn: false }),
  setPrompting: (prompting) => set({ prompting }),
}));
