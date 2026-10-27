import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback } from "react";

import type { MainStackParamList } from "@/navigation/types";

/** Opens a report (a `YYYY-MM` key, or `'sample'` for the bundled preview) over the tabs. */
export function useOpenReport(): (periodKey: string) => void {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  return useCallback(
    (periodKey: string) => navigation.navigate("BrokeReport", { periodKey }),
    [navigation],
  );
}
