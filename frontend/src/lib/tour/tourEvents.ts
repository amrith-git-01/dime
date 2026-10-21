/**
 * Things the user can do that a guided tour may be waiting for. Screens call `emitTourEvent` from
 * the handler of the real tap; the tour store moves a "Do" step on when its `advanceOn` matches.
 * Emitting with no tour running costs nothing, so call sites need no checks.
 */
export const tourEventNames = {
  /** The + menu opened (raised by the tour's own watcher of the menu state). */
  fabOpened: "fabOpened",
  /** A transaction row was opened (Home, Transactions, a filtered list, Insights). */
  transactionOpened: "transactionOpened",
  /** A day was picked on the Transactions calendar. */
  daySelected: "daySelected",
  /** The month changed with the arrows on the Transactions calendar. */
  monthChanged: "monthChanged",
  /** A recurring item was opened on Budgets. */
  recurringOpened: "recurringOpened",
  /** A category's transactions were opened from Budgets. */
  categoryOpened: "categoryOpened",
  /** A payee's transactions were opened from the Insights donut. */
  payeeOpened: "payeeOpened",
  /** A suggested question was tapped in Ask AI. */
  suggestionTapped: "suggestionTapped",
} as const;

export type TourEventName = (typeof tourEventNames)[keyof typeof tourEventNames];

type TourEventListener = (name: string, payload?: unknown) => void;

const listeners = new Set<TourEventListener>();

export function subscribeTourEvents(listener: TourEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitTourEvent(name: string, payload?: unknown): void {
  listeners.forEach((listener) => listener(name, payload));
}
