import { useCallback, useEffect } from "react";
import { Linking } from "react-native";

import { reportError } from "@/lib/reportError";
import { canNavigateToMain } from "@/navigation/canNavigateToMain";
import { navigationRef } from "@/navigation/navigationRef";
import { usePendingDeepLinkStore } from "@/stores/pendingDeepLinkStore";

import { parseDeepLink } from "./parseDeepLink";
import { runDeepLinkIntent } from "./runDeepLinkIntent";

/** The launch URL is read once per JS runtime; a remounted root must not replay it. */
let initialUrlHandled = false;

/**
 * Opens `dime://` links (the Android widgets' taps). A link that arrives before the main stack is
 * on screen (cold start, sign-in still loading) waits in `usePendingDeepLinkStore` and runs as
 * soon as it is, like pending notification taps.
 */
export function useDeepLinkHandler(): { handleNavigationReady: () => void } {
  const drain = useCallback(() => {
    if (!canNavigateToMain()) {
      return;
    }
    const intent = usePendingDeepLinkStore.getState().take();
    if (intent) {
      runDeepLinkIntent(intent);
    }
  }, []);

  useEffect(() => {
    const enqueue = (url: string | null) => {
      const intent = parseDeepLink(url);
      if (!intent) {
        return;
      }
      usePendingDeepLinkStore.getState().enqueue(intent);
      drain();
    };

    if (!initialUrlHandled) {
      initialUrlHandled = true;
      Linking.getInitialURL()
        .then(enqueue)
        .catch((error) => reportError(error, "deep link initial URL failed"));
    }
    const subscription = Linking.addEventListener("url", ({ url }) =>
      enqueue(url),
    );
    const unsubscribeState = navigationRef.addListener("state", drain);

    return () => {
      subscription.remove();
      unsubscribeState();
    };
  }, [drain]);

  return { handleNavigationReady: drain };
}
