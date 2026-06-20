import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import { usePermissionsPromptStore } from "@/stores/permissionsPromptStore";

import type { AppPermissionId } from "../constants/appPermissionItems";
import {
  getAllAppPermissionStates,
  requestAppPermission,
  type AppPermissionState,
} from "../utils/appPermissions";

export function usePermissionsSetupScreenModel() {
  const clearPending = usePermissionsPromptStore(
    (s) => s.clearPendingAfterGoogleSignIn,
  );

  const [permissionStates, setPermissionStates] = useState<
    AppPermissionState[]
  >([]);
  const [requestingId, setRequestingId] = useState<AppPermissionId | null>(
    null,
  );
  const [continuing, setContinuing] = useState(false);

  const refresh = useCallback(async () => {
    const states = await getAllAppPermissionStates();
    setPermissionStates(states);
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refresh]);

  const handleRequestPermission = useCallback(
    async (id: AppPermissionId) => {
      setRequestingId(id);
      try {
        await requestAppPermission(id);
        await refresh();
      } finally {
        setRequestingId(null);
      }
    },
    [refresh],
  );

  const handleContinue = useCallback(() => {
    setContinuing(true);
    clearPending();
    setContinuing(false);
  }, [clearPending]);

  return {
    permissionStates,
    requestingId,
    continuing,
    onRequestPermission: handleRequestPermission,
    onContinue: handleContinue,
  };
}
