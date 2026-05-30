import { InteractionManager, Platform, type TextInput } from "react-native";

/**
 * Focus budget amount field after slider/gesture work completes.
 * Blur→focus on Android re-opens keyboard when re-selecting Custom.
 */
export function focusBudgetAmountInput(
  input: TextInput | null | undefined,
): void {
  if (!input) {
    return;
  }

  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => {
      if (Platform.OS === "android") {
        input.blur();
      }
      requestAnimationFrame(() => {
        input.focus();
      });
    });
  });
}
