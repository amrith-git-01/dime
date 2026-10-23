import { useCallback, useState } from "react";
import { Alert } from "react-native";

import { useSignOut } from "./useSignOut";
import { reportError } from "@/lib/reportError";
import { useOutboxStore } from "@/stores/outboxStore";

type SignOutConfirmModalProps = {
  visible: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLoading: boolean;
};

/** Signing out wipes the outbox, so entries that never reached the server are named in the question. */
export function signOutConfirmMessage(unsyncedCount: number): string {
  const base = "You'll need to sign in again to use the app.";
  if (unsyncedCount <= 0) {
    return base;
  }
  const entries = unsyncedCount === 1 ? "1 unsynced entry" : `${unsyncedCount} unsynced entries`;
  return `${base} ${entries} on this device will be deleted.`;
}

export function useConfirmSignOut() {
  const unsyncedCount = useOutboxStore((state) => state.items.length);
  const { signOut, loading } = useSignOut();
  const [visible, setVisible] = useState(false);

  const performLogout = useCallback(async () => {
    try {
      await signOut();
      setVisible(false);
    } catch (e) {
      reportError(e, "auth logout failed");
      Alert.alert(
        "Couldn't sign out",
        e instanceof Error ? e.message : "Try again.",
      );
    }
  }, [signOut]);

  const confirmSignOut = useCallback(() => {
    setVisible(true);
  }, []);

  const dismissSignOut = useCallback(() => {
    setVisible(false);
  }, []);

  const signOutConfirmModalProps: SignOutConfirmModalProps = {
    visible,
    message: signOutConfirmMessage(unsyncedCount),
    onCancel: dismissSignOut,
    onConfirm: () => {
      void performLogout();
    },
    confirmLoading: loading,
  };

  return {
    confirmSignOut,
    signOutLoading: loading,
    signOutConfirmModalProps,
  };
}
