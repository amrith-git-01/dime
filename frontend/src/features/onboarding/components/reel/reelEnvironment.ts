import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState } from "react-native";

/**
 * Only an explicit background / inactive state counts as "not in the foreground". An unknown or
 * missing initial state must not latch the reel paused: `change` fires only on transitions, so
 * nothing would ever flip it back.
 */
export function isForegroundState(state: string | null | undefined): boolean {
  return state !== "background" && state !== "inactive";
}

/** True while the app is in the foreground. */
export function useAppIsActive(): boolean {
  const [active, setActive] = useState(isForegroundState(AppState.currentState));

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setActive(isForegroundState(state));
    });
    return () => subscription.remove();
  }, []);

  return active;
}

/** Tracks whether a screen reader (TalkBack / VoiceOver) is on. */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (mounted) {
        setEnabled(value);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setEnabled,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
