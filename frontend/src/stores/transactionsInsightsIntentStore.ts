import { create } from "zustand";

export type TransactionsInsightsIntent = {
  year: number;
  monthIndex0: number;
  dayKey?: string;
  /** Drill-down from Insights payee donut (top 6 + Other). */
  payeeKey?: string;
  payeeKeysTop?: string[];
  payeeDisplayName?: string;
};

type TransactionsInsightsIntentState = {
  pending: TransactionsInsightsIntent | null;
  setPending: (intent: TransactionsInsightsIntent | null) => void;
  consume: () => TransactionsInsightsIntent | null;
};

export const useTransactionsInsightsIntentStore =
  create<TransactionsInsightsIntentState>((set, get) => ({
    pending: null,
    setPending: (pending) => set({ pending }),
    consume: () => {
      const current = get().pending;
      if (current) {
        set({ pending: null });
      }
      return current;
    },
  }));
