import { create } from "zustand";

export type TransactionsViewMode = "calendar" | "list";

type TransactionsViewState = {
  mode: TransactionsViewMode;
  setMode: (mode: TransactionsViewMode) => void;
};

/** Which view the Transactions tab shows; kept for the session (not persisted), the calendar by default. */
export const useTransactionsViewStore = create<TransactionsViewState>((set) => ({
  mode: "calendar",
  setMode: (mode) => set({ mode }),
}));
