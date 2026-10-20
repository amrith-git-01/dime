import { useAppTourStore } from "@/features/appTour/store/appTourStore";
import {
  hasSeenFirstUseTip,
  markFirstUseTipSeen,
} from "@/lib/onboarding/firstUseTipStorage";

export const SCAN_TIP_MESSAGE =
  "Receipt added. We'll read the amount and payee: check it in your list and tap to edit.";

/** How long the longer first-scan toast stays, so it can be read. */
export const SCAN_TIP_TOAST_MS = 9000;

/**
 * The scan tip has no screen of its own (the photo goes straight to the queue), so it rides on the
 * success toast of the first upload: returns its text once per device (and never during the guided
 * tour), and remembers that it was shown.
 */
export function takeScanTip(): string | null {
  if (hasSeenFirstUseTip("scan") || useAppTourStore.getState().active) {
    return null;
  }
  markFirstUseTipSeen("scan");
  return SCAN_TIP_MESSAGE;
}
