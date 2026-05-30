import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { Suspense, lazy } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors } from "@/constants/theme";
import ManualAddTransactionScreen from "@/screens/transactions/ManualAddTransactionScreen";

import MainTabNavigator from "./MainTabNavigator";
import type { MainStackParamList } from "./types";

const SettingsScreenLazy = lazy(
  () => import("@/screens/settings/SettingsScreen"),
);
const NotificationsScreenLazy = lazy(
  () => import("@/screens/notifications/NotificationsScreen"),
);
const TransactionDetailScreenLazy = lazy(
  () => import("@/screens/transactions/TransactionDetailScreen"),
);
const CreateCustomCategoryScreenLazy = lazy(
  () => import("@/screens/categories/CreateCustomCategoryScreen"),
);
const EditMonthlyBudgetScreenLazy = lazy(
  () => import("@/screens/budget/EditMonthlyBudgetScreen"),
);

const Stack = createNativeStackNavigator<MainStackParamList>();

function LazyScreenFallback() {
  return (
    <View style={lazyFallbackStyles.root}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function SettingsLazyHost(
  _: NativeStackScreenProps<MainStackParamList, "Settings">,
) {
  return (
    <Suspense fallback={<LazyScreenFallback />}>
      <SettingsScreenLazy />
    </Suspense>
  );
}

function NotificationsLazyHost(
  _: NativeStackScreenProps<MainStackParamList, "Notifications">,
) {
  return (
    <Suspense fallback={<LazyScreenFallback />}>
      <NotificationsScreenLazy />
    </Suspense>
  );
}

function ManualAddHost(
  _: NativeStackScreenProps<MainStackParamList, "ManualAddTransaction">,
) {
  return <ManualAddTransactionScreen />;
}

function TransactionDetailLazyHost(
  _: NativeStackScreenProps<MainStackParamList, "TransactionDetail">,
) {
  return (
    <Suspense fallback={<LazyScreenFallback />}>
      <TransactionDetailScreenLazy />
    </Suspense>
  );
}

function CreateCustomCategoryLazyHost(
  _: NativeStackScreenProps<MainStackParamList, "CreateCustomCategory">,
) {
  return (
    <Suspense fallback={<LazyScreenFallback />}>
      <CreateCustomCategoryScreenLazy />
    </Suspense>
  );
}

function EditMonthlyBudgetLazyHost(
  _: NativeStackScreenProps<MainStackParamList, "EditMonthlyBudget">,
) {
  return (
    <Suspense fallback={<LazyScreenFallback />}>
      <EditMonthlyBudgetScreenLazy />
    </Suspense>
  );
}

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
          component={SettingsLazyHost}
          options={{
            headerShown: true,
            title: "Settings",
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.pageBackground },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="Notifications"
          component={NotificationsLazyHost}
          options={{
            headerShown: true,
            title: "Notifications",
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.pageBackground },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="ManualAddTransaction"
          component={ManualAddHost}
          options={{
            headerShown: true,
            title: "Add transaction",
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.pageBackground },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="TransactionDetail"
          component={TransactionDetailLazyHost}
          options={{
            headerShown: true,
            title: "Transaction",
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.pageBackground },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="CreateCustomCategory"
          component={CreateCustomCategoryLazyHost}
          options={{
            headerShown: true,
            title: "Custom category",
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.pageBackground },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="EditMonthlyBudget"
          component={EditMonthlyBudgetLazyHost}
          options={({ route }) => ({
            headerShown: true,
            title:
              route.params?.mode === "edit" ? "Update budget" : "Monthly budget",
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.pageBackground },
            headerShadowVisible: false,
          })}
        />
      </Stack.Navigator>
    </>
  );
}

const lazyFallbackStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pageBackground,
  },
});
