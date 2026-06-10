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
  EditCategory: { categoryId: string };
  EditMonthlyBudget:
    | {
        mode?: "create" | "edit";
        selectedYear?: number;
        selectedMonthIndex0?: number;
      }
    | undefined;
  TransactionDetail: { transaction: TransactionRow };
  TransactionsList:
    | {
        filter: "day";
        year: number;
        monthIndex0: number;
        dayKey: string;
      }
    | {
        filter: "payee";
        year: number;
        monthIndex0: number;
        payeeKey: string;
        payeeKeysTop: string[];
        payeeDisplayName: string;
      }
    | {
        filter: "category";
        year: number;
        monthIndex0: number;
        categoryId: string;
        categoryDisplayName: string;
      };
  InsightsMonthCompare: {
    monthA: {
      year: number;
      monthIndex0: number;
      label: string;
    };
    monthB: {
      year: number;
      monthIndex0: number;
      label: string;
    };
  };
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
