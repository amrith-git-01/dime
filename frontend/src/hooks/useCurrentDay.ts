import { addDays, startOfDay } from "date-fns";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** Start of the current local day. Updates at midnight and when the app returns to the foreground. */
export function useCurrentDay(): Date {
  const [day, setDay] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      const today = startOfDay(new Date());
      setDay((prev) => (prev.getTime() === today.getTime() ? prev : today));
    };

    const scheduleNextMidnight = () => {
      if (timer) {
        clearTimeout(timer);
      }
      const msUntilMidnight =
        startOfDay(addDays(new Date(), 1)).getTime() - Date.now();
      timer = setTimeout(() => {
        sync();
        scheduleNextMidnight();
      }, msUntilMidnight + 50);
    };

    scheduleNextMidnight();
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        sync();
        scheduleNextMidnight();
      }
    });

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      subscription.remove();
    };
  }, []);

  return day;
}
