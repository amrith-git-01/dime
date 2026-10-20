import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { syncWidgetAdded } from "@/lib/widgets/syncWidgetAdded";
import { getWidgetAdded } from "@/lib/widgets/widgetPreferences";

/**
 * Whether a Dime widget is on this device's home screen. Reads the flag the widget task sets when the
 * launcher adds one, and re-checks with the launcher whenever the app comes back to the foreground
 * (that is where the user returns after following the how-to) while `active`.
 */
export function useWidgetAdded(active: boolean): boolean {
  const [added, setAdded] = useState(getWidgetAdded);

  useEffect(() => {
    if (!active) {
      return;
    }
    let mounted = true;
    const check = () => {
      setAdded(getWidgetAdded());
      void syncWidgetAdded().then((found) => {
        if (mounted && found) {
          setAdded(true);
        }
      });
    };
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        check();
      }
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [active]);

  return added;
}
