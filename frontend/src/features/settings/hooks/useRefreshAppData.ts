import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Alert } from "react-native";

import { useToast } from "@/features/toast/useToast";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { refreshAppDataFromServer } from "@/lib/refreshAppData";
import { reportError } from "@/lib/reportError";

export function useRefreshAppData() {
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const refreshAppData = useCallback(async () => {
    if (!userId) {
      throw new Error("Sign in to refresh data.");
    }
    setLoading(true);
    try {
      await refreshAppDataFromServer(queryClient);
      showToast({ message: "Data refreshed from server", variant: "success" });
    } finally {
      setLoading(false);
    }
  }, [queryClient, showToast, userId]);

  const confirmRefreshAppData = useCallback(() => {
    Alert.alert(
      "Refresh from server?",
      "This downloads the latest data from Dime and replaces what is saved on this device. Your account and settings stay as they are.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Refresh",
          onPress: () => {
            void (async () => {
              try {
                await refreshAppData();
              } catch (error) {
                reportError(error, "settings refresh app data failed");
                Alert.alert(
                  "Couldn’t refresh",
                  error instanceof Error ? error.message : "Try again.",
                );
              }
            })();
          },
        },
      ],
    );
  }, [refreshAppData]);

  return { confirmRefreshAppData, refreshAppData, loading };
}
