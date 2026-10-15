import { useEffect, useState } from "react";
import { Dimensions } from "react-native";

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
/** How long to wait before giving up and showing a centered card (~2.4s). */
const MISSING_AFTER_ATTEMPTS = 40;

function delay(ms: number, onTimer: (timer: ReturnType<typeof setTimeout>) => void) {
  return new Promise<void>((resolve) => {
    onTimer(setTimeout(resolve, ms));
  });
}

/**
 * Finds a tour target's window rect and keeps it current. A freshly mounted tab, a scroll or a
 * navigation transition can all move or delay the target, so it polls until two consecutive
 * measurements agree, then follows it. After a timeout it reports `missing` (the tour falls
 * back to a centered card) but keeps looking in case the target shows up late.
 */
export function useTourTargetRect(
  targetId: string | undefined,
  stepKey: string,
  enabled: boolean,
): { rect: TourRect | null; status: TourTargetStatus } {
  const [resolved, setResolved] = useState<Resolved | null>(null);

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
      let attempts = 0;

      while (!cancelled) {
        const rect = await measureTourTarget(targetId);
        if (cancelled) {
          return;
        }
        const usable =
          rect !== null && isUsableTourRect(rect, window.width, window.height);

        if (usable) {
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

        attempts += 1;
        if (!settled && !reportedMissing && attempts >= MISSING_AFTER_ATTEMPTS) {
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
  }, [enabled, targetId, stepKey]);

  if (!targetId) {
    return { rect: null, status: "none" };
  }
  if (!resolved || resolved.key !== stepKey) {
    return { rect: null, status: "resolving" };
  }
  return { rect: resolved.rect, status: resolved.status };
}
