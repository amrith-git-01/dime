import { create } from "zustand";

type ConnectivityState = {
  /** False while the device reports no connection (NetInfo); assumed true until it says otherwise. */
  isOnline: boolean;
  setOnline: (isOnline: boolean) => void;
};

/**
 * Fed by the NetInfo listener in `appBootstrap` (React Query's `onlineManager` has no subscribe in
 * query-core 5.101, so the UI cannot react to it). The offline banner, "Updated …" line, the Ask AI
 * gate and the outbox drain read this.
 */
export const useConnectivityStore = create<ConnectivityState>((set, get) => ({
  isOnline: true,
  setOnline: (isOnline) => {
    if (get().isOnline !== isOnline) {
      set({ isOnline });
    }
  },
}));
