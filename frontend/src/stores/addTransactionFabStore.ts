import { create } from "zustand";

type AddTransactionFabState = {
  fabOpen: boolean;
  setFabOpen: (open: boolean) => void;
  toggleFab: () => void;
};

export const useAddTransactionFabStore = create<AddTransactionFabState>(
  (set, get) => ({
    fabOpen: false,
    setFabOpen: (fabOpen) => set({ fabOpen }),
    toggleFab: () => set({ fabOpen: !get().fabOpen }),
  }),
);
