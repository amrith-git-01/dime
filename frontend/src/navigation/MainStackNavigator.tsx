import { createNativeStackNavigator } from "@react-navigation/native-stack";

import {
  notificationsInboxShellConfig,
  stackScrollGrowShellConfig,
  stackVirtualizedListShellConfig,
} from "@/components/layout/stackScrollGrowShellConfig";
import { colors } from "@/constants";
import InsightsMonthCompareScreenBase from "@/screens/analytics/InsightsMonthCompareScreen";
import EditMonthlyBudgetScreenBase from "@/screens/budget/EditMonthlyBudgetScreen";
import CreateCustomCategoryScreenBase from "@/screens/categories/CreateCustomCategoryScreen";
import EditCategoryScreenBase from "@/screens/categories/EditCategoryScreen";
import NotificationsScreenBase from "@/screens/notifications/NotificationsScreen";
import SettingsAccountScreenBase from "@/screens/settings/SettingsAccountScreen";
import SettingsEmailScreenBase from "@/screens/settings/SettingsEmailScreen";
import SettingsFeedbackScreenBase from "@/screens/settings/SettingsFeedbackScreen";
import SettingsGlossaryScreenBase from "@/screens/settings/SettingsGlossaryScreen";
import SettingsHapticScreenBase from "@/screens/settings/SettingsHapticScreen";
import SettingsNotificationsScreenBase from "@/screens/settings/SettingsNotificationsScreen";
import SettingsPermissionsScreenBase from "@/screens/settings/SettingsPermissionsScreen";
import SettingsScreenBase from "@/screens/settings/SettingsScreen";
import { settingsStackShellConfig } from "@/screens/settings/settingsStackShellConfig";
import EditTransactionScreenBase from "@/screens/transactions/EditTransactionScreen";
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
const SettingsEmailScreen = withStackScreen(SettingsEmailScreenBase);
const SettingsFeedbackScreen = withStackScreen(SettingsFeedbackScreenBase);
const SettingsHapticScreen = withStackScreen(SettingsHapticScreenBase);
const SettingsGlossaryScreen = withStackScreen(
  SettingsGlossaryScreenBase,
  settingsStackShellConfig,
);
const SettingsPermissionsScreen = withStackScreen(
  SettingsPermissionsScreenBase,
  settingsStackShellConfig,
);
const SettingsNotificationsScreen = withStackScreen(
  SettingsNotificationsScreenBase,
);
const NotificationsScreen = withStackScreen(
  NotificationsScreenBase,
  notificationsInboxShellConfig,
);
const ManualAddTransactionScreen = withStackScreen(
  ManualAddTransactionScreenBase,
);
const EditTransactionScreen = withStackScreen(EditTransactionScreenBase);
// TransactionDetail renders its own overlay — no shell wrapper
const TransactionsListScreen = withStackScreen(
  TransactionsListScreenBase,
  stackVirtualizedListShellConfig,
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
        name="SettingsEmail"
        component={SettingsEmailScreen}
        options={{ ...stackScreenOptions, title: "Email summaries" }}
      />
      <Stack.Screen
        name="SettingsFeedback"
        component={SettingsFeedbackScreen}
        options={{ ...stackScreenOptions, title: "Feedback" }}
      />
      <Stack.Screen
        name="SettingsHaptic"
        component={SettingsHapticScreen}
        options={{ ...stackScreenOptions, title: "Haptic feedback" }}
      />
      <Stack.Screen
        name="SettingsGlossary"
        component={SettingsGlossaryScreen}
        options={{ ...stackScreenOptions, title: "Glossary" }}
      />
      <Stack.Screen
        name="SettingsPermissions"
        component={SettingsPermissionsScreen}
        options={{ ...stackScreenOptions, title: "Permissions" }}
      />
      <Stack.Screen
        name="SettingsNotifications"
        component={SettingsNotificationsScreen}
        options={{ ...stackScreenOptions, title: "Notifications & alerts" }}
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
        name="EditTransaction"
        component={EditTransactionScreen}
        options={{ ...stackScreenOptions, title: "Edit transaction" }}
      />
      <Stack.Screen
        name="TransactionDetail"
        component={TransactionDetailScreenBase}
        options={{
          headerShown: false,
          presentation: "transparentModal",
          animation: "fade",
          contentStyle: { backgroundColor: "transparent" },
        }}
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
