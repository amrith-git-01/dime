import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { msUntilNextIstDay } from "../utils/reportFormat";

/** A beat after midnight, so the timer never fires a moment before the day changes. */
const MIDNIGHT_MARGIN_MS = 1000;

/**
 * "Now", refreshed when the IST calendar day changes (a timer to the next India midnight) and when
 * the app returns to the foreground. Whatever depends on the IST day, like the Home banner's
 * day 1 to 7 window, re-evaluates on its own instead of waiting for an unrelated render.
 */
export function useIstNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msUntilNextIstDay(new Date()) + MIDNIGHT_MARGIN_MS);
    };

    schedule();
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        setNow(new Date());
        schedule();
      }
    });

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      subscription.remove();
    };
  }, []);

  return now;
}
