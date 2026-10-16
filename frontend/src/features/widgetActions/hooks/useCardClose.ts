import { useEffect } from "react";

import { finishWidgetCard } from "../../../../modules/dime-system";
import type { CapturePhase } from "../utils/runCapture";

/** After "Added ₹250 · Swiggy" the card stays a moment, then goes. */
const ADDED_LINGER_MS = 1_500;
/** "Still reading…" is read faster than a result is. */
const TIMEOUT_LINGER_MS = 2_500;

/** Closes the card and returns to the home screen. */
export function closeCard(): void {
  finishWidgetCard();
}

/** Closes the card by itself once a capture has ended well enough to need no action. */
export function useCloseAfterCapture(phase: CapturePhase | null): void {
  useEffect(() => {
    const delay =
      phase === "added" ? ADDED_LINGER_MS : phase === "timeout" ? TIMEOUT_LINGER_MS : null;
    if (delay === null) {
      return;
    }
    const timer = setTimeout(closeCard, delay);
    return () => clearTimeout(timer);
  }, [phase]);
}
