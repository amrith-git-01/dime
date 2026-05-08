import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/layout/AppHeader";
import { DimeTabBar } from "@/components/navigation/DimeTabBar";
import { colors, spacing } from "@/constants/theme";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import AnalyticsScreen from "@/screens/analytics/AnalyticsScreen";
import BudgetsScreen from "@/screens/budgets/BudgetsScreen";
import HomeScreen from "@/screens/home/HomeScreen";
import TransactionsScreen from "@/screens/transactions/TransactionsScreen";

import type { MainStackParamList, MainTabParamList } from "./types";

const Tabs = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  const safeInsets = useSafeAreaInsets();
  const stackNavigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [headerReady, setHeaderReady] = useState(false);
  const [tabBarReady, setTabBarReady] = useState(false);
  const tabBarReservedHeight =
    spacing.tabBarHeight + Math.max(safeInsets.bottom, spacing.sm);
  const shellReady = useMemo(
    () => headerReady && tabBarReady,
    [headerReady, tabBarReady],
  );
  const onNotificationsPress = useCallback(() => {
    void triggerLightHaptic();
    Alert.alert("Notifications", "You have no notifications yet.");
  }, []);
  const onSettingsPress = useCallback(() => {
    void triggerLightHaptic();
    stackNavigation.navigate("Settings");
  }, [stackNavigation]);

  return (
    <View style={styles.root}>
      <View style={styles.headerSlot}>
        <AppHeader
          onNotificationsPress={onNotificationsPress}
          onSettingsPress={onSettingsPress}
          onHeaderReady={() => setHeaderReady(true)}
        />
      </View>
      <View style={styles.navigatorSlot}>
        <Tabs.Navigator
          tabBar={(props) => (
            <DimeTabBar {...props} onFirstLayout={() => setTabBarReady(true)} />
          )}
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
            name="Transactions"
            component={TransactionsScreen}
            options={{
              title: "Transactions",
            }}
          />
          <Tabs.Screen
            name="Budgets"
            component={BudgetsScreen}
            options={{
              title: "Budgets",
            }}
          />
          <Tabs.Screen
            name="Insights"
            component={AnalyticsScreen}
            options={{
              title: "Insights",
            }}
          />
        </Tabs.Navigator>
        {!shellReady ? (
          <View style={styles.shellLoaderOverlay}>
            <ActivityIndicator color={colors.headerGradientStart} />
          </View>
        ) : null}
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
  shellLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.pageBackground,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
});
