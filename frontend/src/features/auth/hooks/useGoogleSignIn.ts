import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useCallback, useState } from "react";

import { supabase } from "@/lib/supabase/client";
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

async function waitForAccessToken(timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
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

      const { data, error: supabaseError } =
        await supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
        });

      if (supabaseError) {
        setError(supabaseError.message);
        return;
      }

      if (data.session?.access_token) {
        return;
      }

      const hasToken = await waitForAccessToken();
      if (!hasToken) {
        setError("Couldn't complete sign-in. Try again.");
      }
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
