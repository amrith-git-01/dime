import { useCallback } from "react";
import { Alert } from "react-native";

import { useSignOut } from "./useSignOut";

export function useConfirmSignOut() {
  const { signOut, loading } = useSignOut();

  const performLogout = useCallback(async () => {
    try {
      await signOut();
    } catch (e) {
      console.warn("[auth] logout failed", e);
      Alert.alert(
        "Couldn’t sign out",
        e instanceof Error ? e.message : "Try again.",
      );
    }
  }, [signOut]);

  const confirmSignOut = useCallback(() => {
    Alert.alert("Sign out?", "You’ll need to sign in again to use the app.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => void performLogout(),
      },
    ]);
  }, [performLogout]);

  return { confirmSignOut, signOutLoading: loading };
}
