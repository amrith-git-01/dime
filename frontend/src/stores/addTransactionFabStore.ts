import { create } from "zustand";

type FabAnimationDriver = {
  requestClose: (onComplete: () => void) => void;
};

let fabAnimationDriver: FabAnimationDriver | null = null;

/** JS-thread only — must not be read from Reanimated worklets. */
let pendingNavigationCallback: (() => void) | null = null;

export function setPendingNavigationCallback(
  callback: (() => void) | null,
): void {
  pendingNavigationCallback = callback;
}

export function clearPendingNavigationCallback(): void {
  pendingNavigationCallback = null;
}

export function invokePendingNavigationCallback(): void {
  const callback = pendingNavigationCallback;
  pendingNavigationCallback = null;
  callback?.();
}

/** DimeTabBar registers smooth close + completion callback before stack navigation. */
export function registerFabAnimationDriver(
  driver: FabAnimationDriver | null,
): void {
  fabAnimationDriver = driver;
}

type AddTransactionFabState = {
  fabOpen: boolean;
  setFabOpen: (open: boolean) => void;
  toggleFab: () => void;
  /** Smoothly closes the FAB menu, then runs `onComplete` (e.g. stack navigate). */
  closeForNavigation: (onComplete: () => void) => void;
};

export const useAddTransactionFabStore = create<AddTransactionFabState>(
  (set, get) => ({
    fabOpen: false,
    setFabOpen: (fabOpen) => set({ fabOpen }),
    toggleFab: () => set({ fabOpen: !get().fabOpen }),
    closeForNavigation: (onComplete) => {
      if (!get().fabOpen) {
        onComplete();
        return;
      }
      if (fabAnimationDriver) {
        fabAnimationDriver.requestClose(onComplete);
        return;
      }
      set({ fabOpen: false });
      onComplete();
    },
  }),
);
