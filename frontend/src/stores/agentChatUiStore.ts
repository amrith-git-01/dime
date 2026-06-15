import { create } from "zustand";

type AgentChatUiState = {
  visible: boolean;
  open: () => void;
  close: () => void;
};

export const useAgentChatUiStore = create<AgentChatUiState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
