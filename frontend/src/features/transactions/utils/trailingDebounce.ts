export type TrailingDebounced = {
  /** (Re)starts the wait; calls arriving inside the window coalesce into one trailing run. */
  schedule: () => void;
  /** Drops a pending run without invoking it. */
  cancel: () => void;
};

/** Trailing-edge debounce for fire-and-forget work such as cache invalidation. */
export function createTrailingDebounce(
  run: () => void,
  delayMs: number,
): TrailingDebounced {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule() {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        run();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
