import { create } from "zustand";

type ManualAddTransactionUiState = {
  visible: boolean;
  open: () => void;
  close: () => void;
};

export const useManualAddTransactionUiStore =
  create<ManualAddTransactionUiState>((set) => ({
    visible: false,
    open: () => set({ visible: true }),
    close: () => set({ visible: false }),
  }));
