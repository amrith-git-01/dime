import { useCallback } from "react";

import { useGoogleSignIn } from "@/features/auth/hooks/useGoogleSignIn";

export function useAuthScreenModel() {
  const google = useGoogleSignIn();

  const submitGoogle = useCallback(() => {
    void google.signInWithGoogle();
  }, [google]);

  return {
    busy: google.loading,
    googleLoading: google.loading,
    googleError: google.error,
    submitGoogle,
  };
}
