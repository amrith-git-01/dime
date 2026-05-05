import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useCallback } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/layout/AppHeader";
import { DimeTabBar } from "@/components/navigation/DimeTabBar";
import { colors, spacing } from "@/constants/theme";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import AnalyticsScreen from "@/screens/analytics/AnalyticsScreen";
import HomeScreen from "@/screens/home/HomeScreen";
import SettingsScreen from "@/screens/settings/SettingsScreen";

import type { MainTabParamList } from "./types";

const Tabs = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  const safeInsets = useSafeAreaInsets();
  const tabBarReservedHeight =
    spacing.tabBarHeight + Math.max(safeInsets.bottom, spacing.sm);
  const onNotificationsPress = useCallback(() => {
    void triggerLightHaptic();
    Alert.alert("Notifications", "You have no notifications yet.");
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.headerSlot}>
        <AppHeader onNotificationsPress={onNotificationsPress} />
      </View>
      <View style={styles.navigatorSlot}>
        <Tabs.Navigator
          tabBar={(props) => <DimeTabBar {...props} />}
          screenListeners={{
            tabPress: () => {
              void triggerLightHaptic();
            },
          }}
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: false,
            /** Matches DimeTabBar so scene layout reserves correct space before first layout. */
            tabBarStyle: { height: tabBarReservedHeight },
          }}
        >
          <Tabs.Screen
            name="Home"
            component={HomeScreen}
            options={{
              title: "Home",
            }}
          />
          <Tabs.Screen
            name="Analytics"
            component={AnalyticsScreen}
            options={{
              title: "Analytics",
            }}
          />
          <Tabs.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              title: "Settings",
            }}
          />
        </Tabs.Navigator>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  headerSlot: {
    flexShrink: 0,
    zIndex: 2,
    elevation: 4,
  },
  navigatorSlot: {
    flex: 1,
    minHeight: 0,
  },
});
