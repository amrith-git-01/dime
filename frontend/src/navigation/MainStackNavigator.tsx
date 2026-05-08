import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { colors } from "@/constants/theme";
import { ManualAddTransactionModal } from "@/features/transactions/components/ManualAddTransactionModal";
import SettingsScreen from "@/screens/settings/SettingsScreen";

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
      </Stack.Navigator>
      <ManualAddTransactionModal />
    </>
  );
}
