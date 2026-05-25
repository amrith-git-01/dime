import { useCallback } from "react";

import type { ToastInput } from "./types";
import { useToastUiStore } from "@/stores/toastUiStore";

export function useToast() {
  const show = useToastUiStore((s) => s.show);
  const hideCurrent = useToastUiStore((s) => s.hideCurrent);
  const clearAll = useToastUiStore((s) => s.clearAll);

  const showToast = useCallback(
    (input: ToastInput) => {
      show(input);
    },
    [show],
  );

  return {
    showToast,
    hideToast: hideCurrent,
    clearToasts: clearAll,
  };
}
