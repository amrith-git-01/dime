import { useCallback, useEffect, useRef, useState } from "react";

import { useEmailPasswordSignIn } from "@/features/auth/hooks/useEmailPasswordSignIn";
import { useEmailPasswordSignUp } from "@/features/auth/hooks/useEmailPasswordSignUp";
import { useGoogleSignIn } from "@/features/auth/hooks/useGoogleSignIn";

type AuthMode = "login" | "register";

export function useAuthScreenModel() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const signIn = useEmailPasswordSignIn();
  const signUp = useEmailPasswordSignUp();
  const google = useGoogleSignIn();
  const { setError: setSignInError } = signIn;
  const { setError: setSignUpError } = signUp;
  const { setError: setGoogleError } = google;

  const clearAuthErrors = useCallback(() => {
    setSignInError(null);
    setSignUpError(null);
    setGoogleError(null);
  }, [setGoogleError, setSignInError, setSignUpError]);

  const isFirstModeMount = useRef(true);
  useEffect(() => {
    if (isFirstModeMount.current) {
      isFirstModeMount.current = false;
      return;
    }
    setEmail("");
    setPassword("");
    setPasswordConfirm("");
    clearAuthErrors();
  }, [mode, clearAuthErrors]);

  const busy = signIn.loading || signUp.loading || google.loading;

  const updateEmail = useCallback(
    (value: string) => {
      setEmail(value);
      clearAuthErrors();
    },
    [clearAuthErrors],
  );

  const updatePassword = useCallback(
    (value: string) => {
      setPassword(value);
      clearAuthErrors();
    },
    [clearAuthErrors],
  );

  const updatePasswordConfirm = useCallback(
    (value: string) => {
      setPasswordConfirm(value);
      clearAuthErrors();
    },
    [clearAuthErrors],
  );

  const submitSignIn = useCallback(() => {
    void signIn.signIn(email, password);
  }, [email, password, signIn]);

  const submitSignUp = useCallback(() => {
    void signUp.signUp(email, password, passwordConfirm);
  }, [email, password, passwordConfirm, signUp]);

  const submitGoogle = useCallback(() => {
    void google.signInWithGoogle();
  }, [google]);

  return {
    mode,
    setMode,
    email,
    password,
    passwordConfirm,
    updateEmail,
    updatePassword,
    updatePasswordConfirm,
    busy,
    signInLoading: signIn.loading,
    signUpLoading: signUp.loading,
    googleLoading: google.loading,
    loginBanner: signIn.error ?? google.error,
    registerBanner: signUp.error ?? google.error,
    submitSignIn,
    submitSignUp,
    submitGoogle,
  };
}
