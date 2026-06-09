import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { useEffect } from "react";

import type { MainTabParamList } from "@/navigation/types";

/** Mount Budget/Insights JS bundles early so first tab switch is faster. */
export function usePreloadSiblingTabScreens(): void {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  useEffect(() => {
    navigation.preload("Budgets");
    navigation.preload("Insights");
  }, [navigation]);
}
