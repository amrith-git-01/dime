import { create } from "zustand";

type PendingSheetState = {
  visible: boolean;
  open: () => void;
  close: () => void;
};

/** Whether the "Pending" sheet (the outbox list) is open; opened from the Home chip and from a pending row. */
export const usePendingSheetStore = create<PendingSheetState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
