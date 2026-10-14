import { create } from "zustand";

type AddTransactionFabState = {
  fabOpen: boolean;
  /** While true the idle timer leaves the open menu alone (the app tour is pointing at it). */
  holdOpen: boolean;
  setFabOpen: (open: boolean) => void;
  setHoldOpen: (hold: boolean) => void;
  toggleFab: () => void;
};

export const useAddTransactionFabStore = create<AddTransactionFabState>(
  (set, get) => ({
    fabOpen: false,
    holdOpen: false,
    setFabOpen: (fabOpen) => set({ fabOpen }),
    setHoldOpen: (holdOpen) => set({ holdOpen }),
    toggleFab: () => set({ fabOpen: !get().fabOpen }),
  }),
);
