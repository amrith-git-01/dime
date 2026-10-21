type Restorable = {
  /** What the screen shows now (month, day...), as plain data. */
  snapshot: () => unknown;
  /** Puts the screen back as a snapshot says. */
  restore: (snapshot: unknown) => void;
};

/**
 * Screen state a guided tour may change (the month on the Transactions calendar, the month on
 * Insights and Budgets). The tour captures every registered screen when it starts and restores them
 * when it ends, so it leaves the app as it found it.
 */
const restorables = new Map<string, Restorable>();

export function registerTourRestorable(key: string, restorable: Restorable): () => void {
  restorables.set(key, restorable);
  return () => {
    if (restorables.get(key) === restorable) {
      restorables.delete(key);
    }
  };
}

export type TourStateSnapshot = Map<string, unknown>;

export function captureTourState(): TourStateSnapshot {
  const captured: TourStateSnapshot = new Map();
  restorables.forEach((restorable, key) => captured.set(key, restorable.snapshot()));
  return captured;
}

/** Restores what was captured, for the screens still mounted. */
export function restoreTourState(captured: TourStateSnapshot): void {
  captured.forEach((value, key) => restorables.get(key)?.restore(value));
}
