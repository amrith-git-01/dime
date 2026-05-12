import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { colors } from "@/constants/theme";
import SettingsScreen from "@/screens/settings/SettingsScreen";
import ManualAddTransactionScreen from "@/screens/transactions/ManualAddTransactionScreen";

import MainTabNavigator from "./MainTabNavigator";
import type { MainStackParamList } from "./types";

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStackNavigator() {
  return (
    <>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.pageBackground },
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            headerShown: true,
            title: "Settings",
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.pageBackground },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="ManualAddTransaction"
          component={ManualAddTransactionScreen}
          options={{
            headerShown: true,
            title: "Add transaction",
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.pageBackground },
            headerShadowVisible: false,
          }}
        />
      </Stack.Navigator>
    </>
  );
}
