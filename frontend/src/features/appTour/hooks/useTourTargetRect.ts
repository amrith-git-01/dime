import { useEffect, useState } from "react";
import { Dimensions } from "react-native";

import {
  revealTourTargetOnce,
  type TourRevealRequest,
} from "@/lib/tour/tourReveal";
import {
  isUsableTourRect,
  measureTourTarget,
  tourRectsEqual,
  type TourRect,
} from "@/lib/tour/tourTargetRegistry";

export type TourTargetStatus = "none" | "resolving" | "ready" | "missing";

type Resolved = {
  /** Which step this result belongs to, so a stale result is never shown for the next step. */
  key: string;
  rect: TourRect | null;
  status: "ready" | "missing";
};

/** Cadence while waiting for the target to appear and hold still (ms). */
const POLL_MS = 60;
/** Cadence once found, to follow scrolling and layout changes (ms). */
const TRACK_MS = 250;
/**
 * How long to wait for a target before giving up (the tour then shows a centered card, or skips an
 * optional step). Wall-clock, not poll counts: each poll takes longer than its delay on a busy
 * device, and a card must never be kept waiting for seconds.
 */
const MISSING_AFTER_MS = 1500;
/** Longer for a target that is scrolled to first (the scroll itself takes a moment). */
const MISSING_AFTER_MS_WITH_SCROLL = 2000;
/** An optional step (skipped when its target is absent) does not keep the user waiting that long. */
const MISSING_AFTER_MS_OPTIONAL = 1000;
/** An optional step whose target is not even mounted is skipped sooner still. */
const UNMOUNTED_AFTER_MS_OPTIONAL = 450;
/** At most this many scrolls per step, and no sooner than this after the last one (ms). */
const MAX_REVEAL_SCROLLS = 5;
const REVEAL_GAP_MS = 380;

/** What the hook needs to scroll a target into view (the target itself comes from the step). */
export type TourTargetReveal = Omit<TourRevealRequest, "targetId">;

function delay(ms: number, onTimer: (timer: ReturnType<typeof setTimeout>) => void) {
  return new Promise<void>((resolve) => {
    onTimer(setTimeout(resolve, ms));
  });
}

/**
 * Finds a tour target's window rect and keeps it current. A freshly mounted tab, a scroll or a
 * navigation transition can all move or delay the target, so it polls until two consecutive
 * measurements agree, then follows it. With `reveal` it first scrolls the target's screen until
 * the target is fully in view. After a timeout it reports `missing` (the tour falls back to a
 * centered card, or skips an optional step) but keeps looking in case the target shows up late.
 */
export function useTourTargetRect(
  targetId: string | undefined,
  stepKey: string,
  enabled: boolean,
  reveal?: TourTargetReveal,
  /** The step is skipped when its target is absent, so give up on it sooner. */
  optional = false,
): { rect: TourRect | null; status: TourTargetStatus } {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  // The reveal request's pieces, spread into deps so a new object each render does not restart the loop.
  const scrollKey = reveal?.scrollKey;
  const anchorId = reveal?.anchorId;
  const windowHeight = reveal?.windowHeight;
  const bottomReserved = reveal?.bottomReserved;
  const fallbackTop = reveal?.fallbackTop;

  useEffect(() => {
    if (!enabled || !targetId) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      const window = Dimensions.get("window");
      let lastSeen: TourRect | null = null;
      let current: TourRect | null = null;
      let settled = false;
      let reportedMissing = false;
      const startedAt = Date.now();
      let everMounted = false;
      let revealScrolls = 0;
      let lastRevealAt = 0;
      let lastRequested: number | null = null;
      const missingAfterMs = optional
        ? MISSING_AFTER_MS_OPTIONAL
        : scrollKey !== undefined
          ? MISSING_AFTER_MS_WITH_SCROLL
          : MISSING_AFTER_MS;

      while (!cancelled) {
        // Bring the target into view first; the scroll is animated, so it is measured again after.
        let scrolledNow = false;
        if (
          scrollKey !== undefined &&
          windowHeight !== undefined &&
          bottomReserved !== undefined &&
          fallbackTop !== undefined &&
          revealScrolls < MAX_REVEAL_SCROLLS &&
          Date.now() - lastRevealAt >= REVEAL_GAP_MS
        ) {
          const requested = await revealTourTargetOnce({
            targetId,
            scrollKey,
            anchorId,
            windowHeight,
            bottomReserved,
            fallbackTop,
          });
          if (cancelled) {
            return;
          }
          // Asking for the same offset twice means the list cannot scroll any further.
          scrolledNow = requested !== null && requested !== lastRequested;
          if (requested !== null) {
            lastRequested = requested;
          }
          if (scrolledNow) {
            revealScrolls += 1;
            lastRevealAt = Date.now();
            lastSeen = null;
            settled = false;
          }
        }

        const rect = await measureTourTarget(targetId);
        if (cancelled) {
          return;
        }
        if (rect !== null) {
          everMounted = true;
        }
        const usable =
          rect !== null && isUsableTourRect(rect, window.width, window.height);

        if (usable && !scrolledNow) {
          if (!settled) {
            if (tourRectsEqual(rect, lastSeen)) {
              settled = true;
              current = rect;
              setResolved({ key: stepKey, rect, status: "ready" });
            }
            lastSeen = rect;
          } else if (!tourRectsEqual(rect, current, 1.5)) {
            current = rect;
            setResolved({ key: stepKey, rect, status: "ready" });
          }
        } else if (!settled) {
          lastSeen = null;
        }

        const waited = Date.now() - startedAt;
        const gaveUp =
          waited >= missingAfterMs ||
          (optional && !everMounted && waited >= UNMOUNTED_AFTER_MS_OPTIONAL);
        if (!settled && !reportedMissing && gaveUp) {
          reportedMissing = true;
          setResolved({ key: stepKey, rect: null, status: "missing" });
        }

        await delay(settled ? TRACK_MS : POLL_MS, (t) => {
          timer = t;
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [
    enabled,
    targetId,
    stepKey,
    scrollKey,
    anchorId,
    windowHeight,
    bottomReserved,
    fallbackTop,
    optional,
  ]);

  if (!targetId) {
    return { rect: null, status: "none" };
  }
  if (!resolved || resolved.key !== stepKey) {
    return { rect: null, status: "resolving" };
  }
  return { rect: resolved.rect, status: resolved.status };
}
