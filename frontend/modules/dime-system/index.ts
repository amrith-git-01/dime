import { requireOptionalNativeModule } from "expo";

type DimeSystemNative = {
  setApplicationNightMode(mode: "system" | "light" | "dark"): void;
  finishWidgetCard(): void;
  isWidgetCardForeground(): boolean;
};

// Absent on iOS and in tests: every call is then a no-op.
const native = requireOptionalNativeModule<DimeSystemNative>("DimeSystem");

/**
 * Persists the in-app theme choice with Android (12+), so the system splash screen follows it too.
 * "system" hands control back to the device. No-op elsewhere.
 */
export function setApplicationNightMode(mode: "system" | "light" | "dark"): void {
  try {
    native?.setApplicationNightMode(mode);
  } catch {
    // Cosmetic only (the splash colour): never let it break the app.
  }
}

/**
 * Closes the widget's capture card (and returns to the home screen). Does nothing when the card
 * is not the screen the user is on, so it can never close the main app. No-op elsewhere.
 */
export function finishWidgetCard(): void {
  try {
    native?.finishWidgetCard();
  } catch {
    // Nothing to close.
  }
}

/**
 * Whether the widget's capture card is the screen the user is on. The card and the app share one JS
 * runtime, so the app asks before it repaints the window or the system bars. False elsewhere.
 */
export function isWidgetCardForeground(): boolean {
  try {
    return native?.isWidgetCardForeground() ?? false;
  } catch {
    return false;
  }
}
