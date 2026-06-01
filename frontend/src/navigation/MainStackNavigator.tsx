import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect } from "react";

import { colors } from "@/constants";
import { notificationsStackShellConfig } from "@/screens/notifications/notificationsStackShellConfig";
import { settingsStackShellConfig } from "@/screens/settings/settingsStackShellConfig";
import ManualAddTransactionScreenBase from "@/screens/transactions/ManualAddTransactionScreen";

import MainTabNavigator from "./MainTabNavigator";
import {
  lazyStackScreen,
  scheduleStackScreenPreload,
  withStackScreen,
} from "./stackScreenHosts";
import { stackScreenModules } from "./stackScreenModules";
import { stackScreenOptions } from "./stackScreenOptions";
import type { MainStackParamList } from "./types";

const Stack = createNativeStackNavigator<MainStackParamList>();

const SettingsScreen = lazyStackScreen(
  stackScreenModules.settings,
  settingsStackShellConfig,
);
const SettingsAccountScreen = lazyStackScreen(
  stackScreenModules.settingsAccount,
);
const SettingsCaptureScreen = lazyStackScreen(
  stackScreenModules.settingsCapture,
);
const SettingsFeedbackScreen = lazyStackScreen(
  stackScreenModules.settingsFeedback,
);
const NotificationsScreen = lazyStackScreen(
  stackScreenModules.notifications,
  notificationsStackShellConfig,
);
const ManualAddTransactionScreen = withStackScreen(
  ManualAddTransactionScreenBase,
);
const TransactionDetailScreen = lazyStackScreen(
  stackScreenModules.transactionDetail,
);
const CreateCustomCategoryScreen = lazyStackScreen(
  stackScreenModules.createCustomCategory,
);
const EditMonthlyBudgetScreen = lazyStackScreen(
  stackScreenModules.editMonthlyBudget,
);

export default function MainStackNavigator() {
  useEffect(() => scheduleStackScreenPreload(), []);

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
        name="SettingsAccount"
        component={SettingsAccountScreen}
        options={{ ...stackScreenOptions, title: "Account" }}
      />
      <Stack.Screen
        name="SettingsCapture"
        component={SettingsCaptureScreen}
        options={{ ...stackScreenOptions, title: "Capture" }}
      />
      <Stack.Screen
        name="SettingsFeedback"
        component={SettingsFeedbackScreen}
        options={{ ...stackScreenOptions, title: "Feedback" }}
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
