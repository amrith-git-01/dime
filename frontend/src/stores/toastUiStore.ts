import { create } from "zustand";

import type { ToastInput, ToastItem } from "@/features/toast/types";

const DEFAULT_DURATION_MS = 5000;
const ACTION_DURATION_MS = 5000;

type ToastUiState = {
  current: ToastItem | null;
  queue: ToastItem[];
  show: (input: ToastInput) => void;
  hideCurrent: () => void;
  clearAll: () => void;
};

let toastSequence = 0;

function toToastItem(input: ToastInput): ToastItem {
  toastSequence += 1;
  const durationMs =
    input.durationMs ??
    (input.action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS);
  return {
    id: `toast-${Date.now()}-${toastSequence}`,
    message: input.message.trim(),
    variant: input.variant ?? "info",
    position: input.position ?? "bottom",
    durationMs,
    action: input.action,
  };
}

export const useToastUiStore = create<ToastUiState>((set) => ({
  current: null,
  queue: [],
  show: (input) =>
    set((state) => {
      const item = toToastItem(input);
      if (item.message.length === 0) {
        return state;
      }
      if (state.current === null) {
        return { ...state, current: item };
      }
      return { ...state, queue: [...state.queue, item] };
    }),
  hideCurrent: () =>
    set((state) => {
      if (state.queue.length === 0) {
        return { ...state, current: null };
      }
      const [next, ...rest] = state.queue;
      return {
        ...state,
        current: next,
        queue: rest,
      };
    }),
  clearAll: () => set({ current: null, queue: [] }),
}));
