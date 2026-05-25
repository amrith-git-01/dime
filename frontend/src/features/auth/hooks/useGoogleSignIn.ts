import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useCallback, useState } from "react";

import { supabase } from "@/lib/supabase/client";

function isSignInCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === statusCodes.SIGN_IN_CANCELLED
  );
}

export function useGoogleSignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();

      const response = await GoogleSignin.signIn();

      const { data } = response;
      if (!data?.idToken) {
        throw new Error("No ID token returned");
      }

      const { error: supabaseError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: data.idToken,
      });

      if (supabaseError) throw supabaseError;
    } catch (e: unknown) {
      if (isSignInCancelled(e)) {
        return;
      }
      setError(e instanceof Error ? e.message : "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  }, []);

  return { signInWithGoogle, loading, error, setError };
}
