/**
 * The capture card and the headless widget task run in the same JS runtime as the app (when it is
 * alive), so a plain listener set reaches the app without any native bridge. Emitted after the card
 * saved an expense or a capture settled: the app refetches its transaction queries, which also makes
 * its snapshot writer write fresh totals instead of overwriting the card's with stale ones.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Returns the unsubscribe function. */
export function onWidgetTransactionsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitWidgetTransactionsChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A listener's failure must not stop the others or the capture.
    }
  }
}
