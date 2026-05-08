import { create } from "zustand";

type ReceiptScanUiState = {
  visible: boolean;
  message: string;
  show: (message: string) => void;
  hide: () => void;
};

export const useReceiptScanUiStore = create<ReceiptScanUiState>((set) => ({
  visible: false,
  message: "",
  show: (message) => set({ visible: true, message }),
  hide: () => set({ visible: false, message: "" }),
}));
