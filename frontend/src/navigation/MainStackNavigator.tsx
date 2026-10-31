import { createNativeStackNavigator } from "@react-navigation/native-stack";

import {
  notificationsInboxShellConfig,
  stackScrollGrowShellConfig,
  stackVirtualizedListShellConfig,
} from "@/components/layout/stackScrollGrowShellConfig";
import BrokeReportScreenBase from "@/screens/brokeReport/BrokeReportScreen";
import InsightsMonthCompareScreenBase from "@/screens/analytics/InsightsMonthCompareScreen";
import EditMonthlyBudgetScreenBase from "@/screens/budget/EditMonthlyBudgetScreen";
import RecurringEditorScreenBase from "@/screens/recurring/RecurringEditorScreen";
import ReminderEditorScreenBase from "@/screens/reminders/ReminderEditorScreen";
import RemindersScreenBase from "@/screens/reminders/RemindersScreen";
import CreateCustomCategoryScreenBase from "@/screens/categories/CreateCustomCategoryScreen";
import EditCategoryScreenBase from "@/screens/categories/EditCategoryScreen";
import NotificationsScreenBase from "@/screens/notifications/NotificationsScreen";
import SettingsBrokeReportsScreenBase from "@/screens/settings/SettingsBrokeReportsScreen";
import SettingsAccountScreenBase from "@/screens/settings/SettingsAccountScreen";
import SettingsAppearanceScreenBase from "@/screens/settings/SettingsAppearanceScreen";
import SettingsEmailScreenBase from "@/screens/settings/SettingsEmailScreen";
import SettingsFeedbackScreenBase from "@/screens/settings/SettingsFeedbackScreen";
import SettingsGlossaryScreenBase from "@/screens/settings/SettingsGlossaryScreen";
import SettingsHapticScreenBase from "@/screens/settings/SettingsHapticScreen";
import SettingsNotificationsScreenBase from "@/screens/settings/SettingsNotificationsScreen";
import SettingsPermissionsScreenBase from "@/screens/settings/SettingsPermissionsScreen";
import SettingsScreenBase from "@/screens/settings/SettingsScreen";
import SettingsToursScreenBase from "@/screens/settings/SettingsToursScreen";
import { settingsStackShellConfig } from "@/screens/settings/settingsStackShellConfig";
import EditTransactionScreenBase from "@/screens/transactions/EditTransactionScreen";
import ManualAddTransactionScreenBase from "@/screens/transactions/ManualAddTransactionScreen";
import TransactionDetailScreenBase from "@/screens/transactions/TransactionDetailScreen";
import TransactionsListScreenBase from "@/screens/transactions/TransactionsListScreen";

import { RECURRING_COPY } from "@/features/recurring/utils/recurringDisplay";

import { brokeReportScreenOptions, getBrokeReportScreenId } from "./brokeReportRoute";
import MainTabNavigator from "./MainTabNavigator";
import { withStackScreen } from "./stackScreenHosts";
import { stackScreenOptions } from "./stackScreenOptions";
import type { MainStackParamList } from "./types";
import { useTheme } from "@/theme";

const Stack = createNativeStackNavigator<MainStackParamList>();

const SettingsScreen = withStackScreen(
  SettingsScreenBase,
  settingsStackShellConfig,
);
const SettingsAccountScreen = withStackScreen(SettingsAccountScreenBase);
const SettingsEmailScreen = withStackScreen(SettingsEmailScreenBase);
const SettingsFeedbackScreen = withStackScreen(SettingsFeedbackScreenBase);
const SettingsHapticScreen = withStackScreen(SettingsHapticScreenBase);
const SettingsAppearanceScreen = withStackScreen(SettingsAppearanceScreenBase);
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
const SettingsToursScreen = withStackScreen(
  SettingsToursScreenBase,
  settingsStackShellConfig,
);
const SettingsBrokeReportsScreen = withStackScreen(
  SettingsBrokeReportsScreenBase,
  settingsStackShellConfig,
);
const NotificationsScreen = withStackScreen(
  NotificationsScreenBase,
  notificationsInboxShellConfig,
);
const ManualAddTransactionScreen = withStackScreen(
  ManualAddTransactionScreenBase,
);
const EditTransactionScreen = withStackScreen(EditTransactionScreenBase);
// TransactionDetail and BrokeReport render their own full-screen surface — no shell wrapper
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
const RecurringEditorScreen = withStackScreen(RecurringEditorScreenBase);
// The list owns its scroll view (it scrolls a highlighted reminder into view), so the shell must not wrap it.
const RemindersScreen = withStackScreen(
  RemindersScreenBase,
  stackVirtualizedListShellConfig,
);
const ReminderEditorScreen = withStackScreen(ReminderEditorScreenBase);

export default function MainStackNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
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
        name="SettingsAppearance"
        component={SettingsAppearanceScreen}
        options={{ ...stackScreenOptions, title: "Appearance" }}
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
        name="SettingsTours"
        component={SettingsToursScreen}
        options={{ ...stackScreenOptions, title: "Tours" }}
      />
      <Stack.Screen
        name="SettingsBrokeReports"
        component={SettingsBrokeReportsScreen}
        options={{ ...stackScreenOptions, title: "Broke Reports" }}
      />
      <Stack.Screen
        name="BrokeReport"
        component={BrokeReportScreenBase}
        options={brokeReportScreenOptions}
        getId={getBrokeReportScreenId}
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
      <Stack.Screen
        name="Reminders"
        component={RemindersScreen}
        options={{ ...stackScreenOptions, title: "Reminders" }}
      />
      <Stack.Screen
        name="ReminderEditor"
        component={ReminderEditorScreen}
        options={({ route }) => ({
          ...stackScreenOptions,
          title: route.params?.reminder ? "Edit reminder" : "Add reminder",
        })}
      />
      <Stack.Screen
        name="RecurringEditor"
        component={RecurringEditorScreen}
        options={({ route }) => ({
          ...stackScreenOptions,
          title: route.params.item
            ? RECURRING_COPY[route.params.kind].editTitle
            : RECURRING_COPY[route.params.kind].addTitle,
        })}
      />
    </Stack.Navigator>
  );
}
