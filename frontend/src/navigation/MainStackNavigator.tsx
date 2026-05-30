import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { colors } from "@/constants/theme";
import { settingsStackShellConfig } from "@/screens/settings/settingsStackShellConfig";
import ManualAddTransactionScreenBase from "@/screens/transactions/ManualAddTransactionScreen";

import MainTabNavigator from "./MainTabNavigator";
import { lazyStackScreen, withStackScreen } from "./stackScreenHosts";
import { stackScreenOptions } from "./stackScreenOptions";
import type { MainStackParamList } from "./types";

const Stack = createNativeStackNavigator<MainStackParamList>();

const SettingsScreen = lazyStackScreen(
  () => import("@/screens/settings/SettingsScreen"),
  settingsStackShellConfig,
);
const NotificationsScreen = lazyStackScreen(
  () => import("@/screens/notifications/NotificationsScreen"),
);
const ManualAddTransactionScreen = withStackScreen(
  ManualAddTransactionScreenBase,
);
const TransactionDetailScreen = lazyStackScreen(
  () => import("@/screens/transactions/TransactionDetailScreen"),
);
const CreateCustomCategoryScreen = lazyStackScreen(
  () => import("@/screens/categories/CreateCustomCategoryScreen"),
);
const EditMonthlyBudgetScreen = lazyStackScreen(
  () => import("@/screens/budget/EditMonthlyBudgetScreen"),
);

export default function MainStackNavigator() {
  return (
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
        options={{ ...stackScreenOptions, title: "Settings" }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ ...stackScreenOptions, title: "Notifications" }}
      />
      <Stack.Screen
        name="ManualAddTransaction"
        component={ManualAddTransactionScreen}
        options={{ ...stackScreenOptions, title: "Add transaction" }}
      />
      <Stack.Screen
        name="TransactionDetail"
        component={TransactionDetailScreen}
        options={{ ...stackScreenOptions, title: "Transaction" }}
      />
      <Stack.Screen
        name="CreateCustomCategory"
        component={CreateCustomCategoryScreen}
        options={{ ...stackScreenOptions, title: "Custom category" }}
      />
      <Stack.Screen
        name="EditMonthlyBudget"
        component={EditMonthlyBudgetScreen}
        options={({ route }) => ({
          ...stackScreenOptions,
          title:
            route.params?.mode === "edit"
              ? "Update budget limits"
              : "Budget limits",
        })}
      />
    </Stack.Navigator>
  );
}
