import type { NavigatorScreenParams } from "@react-navigation/native";

import type { TransactionRow } from "@/features/transactions/types";

export type MainTabParamList = {
  Home: undefined;
  Transactions: undefined;
  Budgets: undefined;
  Insights: undefined;
};

export type MainStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Settings: undefined;
  SettingsAccount: undefined;
  SettingsCapture: undefined;
  SettingsFeedback: undefined;
  Notifications: undefined;
  ManualAddTransaction:
    | {
        createdCategoryId?: string;
        createdCategoryName?: string;
      }
    | undefined;
  CreateCustomCategory: { origin?: "budget" | "manual-add" } | undefined;
  EditMonthlyBudget:
    | {
        mode?: "create" | "edit";
        selectedYear?: number;
        selectedMonthIndex0?: number;
      }
    | undefined;
  TransactionDetail: { transaction: TransactionRow };
};

export type RootStackParamList = {
  Auth: undefined;
  SessionResolving: undefined;
  ProfileSetup: undefined;
  Main: NavigatorScreenParams<MainStackParamList>;
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
