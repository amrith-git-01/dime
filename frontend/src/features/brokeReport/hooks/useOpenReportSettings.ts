import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback } from "react";

import type { MainStackParamList } from "@/navigation/types";

/** Opens Settings -> Broke Reports (the monthly push, the roast level and every report). */
export function useOpenReportSettings(): () => void {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  return useCallback(
    () => navigation.navigate("SettingsBrokeReports"),
    [navigation],
  );
}
