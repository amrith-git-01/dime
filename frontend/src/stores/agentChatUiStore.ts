import { create } from "zustand";

type AgentChatUiState = {
  visible: boolean;
  /** Epoch ms until which the daily question limit blocks sending; null when not limited. */
  limitedUntil: number | null;
  setLimitedUntil: (epochMs: number | null) => void;
  open: () => void;
  close: () => void;
};

export const useAgentChatUiStore = create<AgentChatUiState>((set) => ({
  visible: false,
  limitedUntil: null,
  setLimitedUntil: (limitedUntil) => set({ limitedUntil }),
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
