import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { BarChart3, House, Settings } from "lucide-react-native";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "@/constants/theme";
import AnalyticsScreen from "@/screens/analytics/AnalyticsScreen";
import HomeScreen from "@/screens/home/HomeScreen";
import SettingsScreen from "@/screens/settings/SettingsScreen";

import type { MainTabParamList } from "./types";

const Tabs = createBottomTabNavigator<MainTabParamList>();

/**
 * One continuous surface (incl. Android gesture / 3-button inset) so the system
 * nav region matches {@link colors.barBackground}. Icon contrast is handled natively
 * via `NavigationBar.setStyle('light')` (Material: light bar, dark controls).
 */
function TabBarBackground() {
  return <View style={styles.tabBarBackgroundSolid} />;
}

export default function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const tabBarBottomPadding = Math.max(insets.bottom, spacing.sm);
  const tabBarHeight = spacing.tabBarHeight + tabBarBottomPadding;

  return (
    <Tabs.Navigator
      screenListeners={{
        tabPress: () => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inactive,
        tabBarBackground: () => <TabBarBackground />,
        tabBarStyle: [
          styles.tabBar,
          {
            height: tabBarHeight,
            paddingBottom: tabBarBottomPadding,
          },
        ],
      }}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <House size={spacing.iconTab} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          title: "Analytics",
          tabBarIcon: ({ color }) => (
            <BarChart3 size={spacing.iconTab} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <Settings size={spacing.iconTab} color={color} strokeWidth={2} />
          ),
        }}
      />
    </Tabs.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    backgroundColor: "transparent",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  tabBarBackgroundSolid: {
    flex: 1,
    backgroundColor: colors.barBackground,
  },
});
