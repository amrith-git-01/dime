import { useEffect } from "react";
import { Keyboard, TextInput } from "react-native";
import { KeyboardEvents } from "react-native-keyboard-controller";

/** Wait out transient hides (e.g. blur()->focus() hand-offs) before treating the keyboard as closed. */
const SETTLE_MS = 120;

/**
 * Android back dismisses the keyboard but leaves the TextInput focused (caret stays, and a tap
 * on the focused field never reopens the keyboard). Mounted once at the app root: whenever the
 * keyboard has really closed, blur whatever input still believes it is focused.
 */
export function useBlurFocusedInputOnKeyboardHide(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const subscription = KeyboardEvents.addListener("keyboardDidHide", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!Keyboard.isVisible()) {
          TextInput.State.currentlyFocusedInput()?.blur();
        }
      }, SETTLE_MS);
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);
}
