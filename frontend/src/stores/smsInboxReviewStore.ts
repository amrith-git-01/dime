import { create } from "zustand";

import type { InboxSms } from "@/features/transactions/sms/smsTypes";

export type SmsInboxGatePhase = "idle" | "scanning" | "review" | "done";

type SmsInboxReviewState = {
  phase: SmsInboxGatePhase;
  shown: InboxSms[];
  remaining: InboxSms[];
  beginScan: () => void;
  beginReview: (kept: InboxSms[]) => void;
  markDone: () => void;
  resetIdle: () => void;
  updateBody: (id: string, body: string) => void;
  deleteRow: (id: string) => void;
};

export const useSmsInboxReviewStore = create<SmsInboxReviewState>((set) => ({
  phase: "idle",
  shown: [],
  remaining: [],
  beginScan: () => set({ phase: "scanning" }),
  beginReview: (kept) =>
    set({
      phase: "review",
      shown: kept,
      remaining: kept,
    }),
  markDone: () =>
    set({
      phase: "done",
      shown: [],
      remaining: [],
    }),
  resetIdle: () =>
    set({
      phase: "idle",
      shown: [],
      remaining: [],
    }),
  updateBody: (id, body) =>
    set((state) => ({
      remaining: state.remaining.map((row) =>
        row.id === id ? { ...row, body } : row,
      ),
    })),
  deleteRow: (id) =>
    set((state) => ({
      remaining: state.remaining.filter((row) => row.id !== id),
    })),
}));
