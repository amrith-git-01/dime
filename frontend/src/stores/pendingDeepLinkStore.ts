import { create } from "zustand";

import type { DeepLinkIntent } from "@/lib/deepLinks/parseDeepLink";

type PendingDeepLinkState = {
  /** A link waiting for the main stack to be on screen. Only the latest one is kept. */
  pending: DeepLinkIntent | null;
  /** `dime://scan` was opened; the main tabs (which own the camera flow) pick it up. */
  scanRequested: boolean;
  enqueue: (intent: DeepLinkIntent) => void;
  /** Returns the waiting link and clears it. */
  take: () => DeepLinkIntent | null;
  requestScan: () => void;
  consumeScan: () => void;
};

export const usePendingDeepLinkStore = create<PendingDeepLinkState>(
  (set, get) => ({
    pending: null,
    scanRequested: false,
    enqueue: (pending) => set({ pending }),
    take: () => {
      const { pending } = get();
      if (pending) {
        set({ pending: null });
      }
      return pending;
    },
    requestScan: () => set({ scanRequested: true }),
    consumeScan: () => set({ scanRequested: false }),
  }),
);
