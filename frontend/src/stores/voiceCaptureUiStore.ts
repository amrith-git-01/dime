import { create } from "zustand";

type VoiceCaptureUiState = {
  visible: boolean;
  open: () => void;
  close: () => void;
};

export const useVoiceCaptureUiStore = create<VoiceCaptureUiState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
