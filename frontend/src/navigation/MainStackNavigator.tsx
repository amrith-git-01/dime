import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { stackScrollGrowShellConfig } from "@/components/layout/stackScrollGrowShellConfig";
import { colors } from "@/constants";
import InsightsMonthCompareScreenBase from "@/screens/analytics/InsightsMonthCompareScreen";
import EditMonthlyBudgetScreenBase from "@/screens/budget/EditMonthlyBudgetScreen";
import CreateCustomCategoryScreenBase from "@/screens/categories/CreateCustomCategoryScreen";
import EditCategoryScreenBase from "@/screens/categories/EditCategoryScreen";
import NotificationsScreenBase from "@/screens/notifications/NotificationsScreen";
import SettingsAccountScreenBase from "@/screens/settings/SettingsAccountScreen";
import SettingsCaptureScreenBase from "@/screens/settings/SettingsCaptureScreen";
import SettingsFeedbackScreenBase from "@/screens/settings/SettingsFeedbackScreen";
import SettingsScreenBase from "@/screens/settings/SettingsScreen";
import { settingsStackShellConfig } from "@/screens/settings/settingsStackShellConfig";
import ManualAddTransactionScreenBase from "@/screens/transactions/ManualAddTransactionScreen";
import TransactionDetailScreenBase from "@/screens/transactions/TransactionDetailScreen";
import TransactionsListScreenBase from "@/screens/transactions/TransactionsListScreen";

import MainTabNavigator from "./MainTabNavigator";
import { withStackScreen } from "./stackScreenHosts";
import { stackScreenOptions } from "./stackScreenOptions";
import type { MainStackParamList } from "./types";

const Stack = createNativeStackNavigator<MainStackParamList>();

const SettingsScreen = withStackScreen(
  SettingsScreenBase,
  settingsStackShellConfig,
);
const SettingsAccountScreen = withStackScreen(SettingsAccountScreenBase);
const SettingsCaptureScreen = withStackScreen(SettingsCaptureScreenBase);
const SettingsFeedbackScreen = withStackScreen(SettingsFeedbackScreenBase);
const NotificationsScreen = withStackScreen(
  NotificationsScreenBase,
  stackScrollGrowShellConfig,
);
const ManualAddTransactionScreen = withStackScreen(
  ManualAddTransactionScreenBase,
);
const TransactionDetailScreen = withStackScreen(TransactionDetailScreenBase);
const TransactionsListScreen = withStackScreen(
  TransactionsListScreenBase,
  stackScrollGrowShellConfig,
);
const InsightsMonthCompareScreen = withStackScreen(
  InsightsMonthCompareScreenBase,
  stackScrollGrowShellConfig,
);
const CreateCustomCategoryScreen = withStackScreen(
  CreateCustomCategoryScreenBase,
);
const EditCategoryScreen = withStackScreen(EditCategoryScreenBase);
const EditMonthlyBudgetScreen = withStackScreen(EditMonthlyBudgetScreenBase);

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
        name="TransactionsList"
        component={TransactionsListScreen}
        options={{ ...stackScreenOptions, title: "Transactions" }}
      />
      <Stack.Screen
        name="InsightsMonthCompare"
        component={InsightsMonthCompareScreen}
        options={{ ...stackScreenOptions, title: "Compare months" }}
      />
      <Stack.Screen
        name="CreateCustomCategory"
        component={CreateCustomCategoryScreen}
        options={{ ...stackScreenOptions, title: "Custom category" }}
      />
      <Stack.Screen
        name="EditCategory"
        component={EditCategoryScreen}
        options={{ ...stackScreenOptions, title: "Edit category" }}
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
