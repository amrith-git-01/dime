const DELTA_FLUSH_INTERVAL_MS = 50;

export type DeltaBatcher = {
  /** Queue streamed text; flushed once per interval as a single string. */
  push: (text: string) => void;
  /** Drop queued text and any scheduled flush (turn ended or was cancelled). */
  cancel: () => void;
};

/**
 * Coalesces token-sized deltas so the UI re-renders at most once per interval
 * instead of once per token.
 */
export function createDeltaBatcher(
  flush: (text: string) => void,
  intervalMs: number = DELTA_FLUSH_INTERVAL_MS,
): DeltaBatcher {
  let buffer = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    push(text) {
      buffer += text;
      if (timer !== null) {
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        const text = buffer;
        buffer = "";
        if (text) {
          flush(text);
        }
      }, intervalMs);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      buffer = "";
    },
  };
}
