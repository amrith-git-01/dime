import { create } from "zustand";

export type TransactionsViewMode = "calendar" | "list";

type TransactionsViewState = {
  mode: TransactionsViewMode;
  setMode: (mode: TransactionsViewMode) => void;
};

/** Which view the Transactions tab shows; kept for the session (not persisted), the list by default (the calendar is the other view). */
export const useTransactionsViewStore = create<TransactionsViewState>((set) => ({
  mode: "list",
  setMode: (mode) => set({ mode }),
}));
