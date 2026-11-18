import { Linking } from "react-native";

import { addDeepLinkUrl } from "@/lib/deepLinks/deepLinkUrls";
import { reportError } from "@/lib/reportError";

import { closeCard } from "../hooks/useCardClose";
import type { CaptureResult } from "./runCapture";

/**
 * A capture in a foreign currency posted nothing: opens the app's manual form with the payee and a note of what
 * was read ("Read as USD 12.00"), the keypad ready for the rupee amount, and closes the card.
 */
export function openCaptureReview(review: CaptureResult["review"] | null): void {
  const note = review?.read ? `Read as ${review.read}` : null;
  Linking.openURL(addDeepLinkUrl({ payee: review?.payee ?? null, note }))
    .catch((error) => reportError(error, "widget card could not open the manual form"))
    .finally(closeCard);
}
