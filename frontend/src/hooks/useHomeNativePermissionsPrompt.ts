import { useEffect } from "react";

import { requestAllAppPermissionsSequentially } from "@/features/onboarding/utils/appPermissions";
import { usePermissionsPromptStore } from "@/stores/permissionsPromptStore";

/**
 * After first sign-in, shows native OS permission dialogs on Home (notifications,
 * camera, microphone) instead of a dedicated setup screen.
 */
export function useHomeNativePermissionsPrompt(): void {
  const pending = usePermissionsPromptStore((s) => s.pendingAfterGoogleSignIn);
  const clearPending = usePermissionsPromptStore(
    (s) => s.clearPendingAfterGoogleSignIn,
  );
  const setPrompting = usePermissionsPromptStore((s) => s.setPrompting);

  useEffect(() => {
    if (!pending || usePermissionsPromptStore.getState().prompting) {
      return;
    }

    // `prompting` goes up before `pending` comes down, so the app tour never sees a gap.
    setPrompting(true);
    clearPending();

    void (async () => {
      try {
        await requestAllAppPermissionsSequentially();
      } finally {
        setPrompting(false);
      }
    })();
  }, [pending, clearPending, setPrompting]);
}
