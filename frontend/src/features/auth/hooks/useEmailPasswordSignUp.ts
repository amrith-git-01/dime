import { useCallback, useState } from "react";

import { supabase } from "@/lib/supabase/client";

/** Same deep link as `app.json` scheme + `/auth/callback` (replaces removed oauthRedirect helper). */
function getEmailConfirmationRedirectUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.trim();
  if (fromEnv) return fromEnv;
  return "frontend://auth/callback";
}

export function useEmailPasswordSignUp() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signUp = useCallback(
    async (email: string, password: string, passwordConfirm: string) => {
      setError(null);
      if (password !== passwordConfirm) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 8) {
        setError("Use at least 8 characters");
        return;
      }
      setLoading(true);
      try {
        const { error: e } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: getEmailConfirmationRedirectUrl() },
        });
        if (e) throw e;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Sign up failed");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { signUp, loading, error, setError };
}
