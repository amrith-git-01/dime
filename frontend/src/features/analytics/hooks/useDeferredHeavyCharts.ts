import { useIsFocused } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { InteractionManager } from "react-native";

/** Defers Victory/Skia chart mount until the tab is focused and UI is idle. */
export function useDeferredHeavyCharts(): boolean {
  const isFocused = useIsFocused();
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    if (!isFocused || chartsReady) {
      return;
    }

    const task = InteractionManager.runAfterInteractions(() => {
      setChartsReady(true);
    });

    return () => task.cancel();
  }, [chartsReady, isFocused]);

  return chartsReady;
}
