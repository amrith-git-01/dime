import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useCallback, useState } from "react";

import { signInWithGoogleIdToken } from "@/lib/auth/session";
import { useGoogleAuthGate } from "@/stores/googleAuthGate";

function isSignInCancelled(error: unknown): boolean {
  return isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED;
}

function googleSignInErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Couldn't sign in with Google. Try again.";
}

export function useGoogleSignIn() {
  const [error, setError] = useState<string | null>(null);
  const isPending = useGoogleAuthGate((s) => s.isPending);
  const setGatePending = useGoogleAuthGate((s) => s.setIsPending);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setGatePending(true);
    try {
      await GoogleSignin.hasPlayServices();

      const response = await GoogleSignin.signIn();
      if (isCancelledResponse(response) || !isSuccessResponse(response)) {
        return;
      }

      const idToken = response.data.idToken;
      if (!idToken) {
        setError("Couldn't complete Google sign-in. Try again.");
        return;
      }

      // Throws with a user-facing message when the server rejects the token or is unreachable.
      await signInWithGoogleIdToken(idToken);
    } catch (e: unknown) {
      if (!isSignInCancelled(e)) {
        setError(googleSignInErrorMessage(e));
      }
    } finally {
      setGatePending(false);
    }
  }, [setGatePending]);

  return { signInWithGoogle, loading: isPending, error, setError };
}
