import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { useEffect } from "react";
import { InteractionManager } from "react-native";

import type { MainTabParamList } from "@/navigation/types";

/**
 * Mount Budget/Insights JS bundles early so first tab switch is faster.
 * Must run inside a tab screen (not MainTabNavigator) so `useNavigation`
 * resolves to the bottom-tab navigator.
 */
export function usePreloadSiblingTabScreens(): void {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      if (typeof navigation.preload !== "function") {
        return;
      }
      // Preload Budgets only — preloading Insights mounts charts off-focus and
      // forces skeleton placeholders even when MMKV already has insights data.
      navigation.preload("Budgets");
    });

    return () => task.cancel();
  }, [navigation]);
}
