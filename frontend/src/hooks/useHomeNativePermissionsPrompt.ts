import { useEffect } from "react";

import { requestAllAppPermissionsSequentially } from "@/features/onboarding/utils/appPermissions";
import { usePermissionsPromptStore } from "@/stores/permissionsPromptStore";

let promptingInFlight = false;

/**
 * After first sign-in, shows native OS permission dialogs on Home (notifications,
 * camera, microphone) instead of a dedicated setup screen.
 */
export function useHomeNativePermissionsPrompt(): void {
  const pending = usePermissionsPromptStore((s) => s.pendingAfterGoogleSignIn);
  const clearPending = usePermissionsPromptStore(
    (s) => s.clearPendingAfterGoogleSignIn,
  );

  useEffect(() => {
    if (!pending || promptingInFlight) {
      return;
    }

    promptingInFlight = true;
    clearPending();

    void (async () => {
      try {
        await requestAllAppPermissionsSequentially();
      } finally {
        promptingInFlight = false;
      }
    })();
  }, [pending, clearPending]);
}
