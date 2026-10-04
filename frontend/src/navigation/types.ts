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
  SettingsEmail: undefined;
  SettingsFeedback: undefined;
  SettingsHaptic: undefined;
  SettingsGlossary: undefined;
  SettingsPermissions: undefined;
  SettingsNotifications: undefined;
  Notifications: undefined;
  ManualAddTransaction:
    | {
        createdCategoryId?: string;
        createdCategoryName?: string;
      }
    | undefined;
  EditTransaction: {
    transaction?: TransactionRow;
    createdCategoryId?: string;
    createdCategoryName?: string;
  };
  CreateCustomCategory:
    | { origin?: "budget" | "manual-add" | "edit-transaction" }
    | undefined;
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
        /** Exact counterparty_normalized from the database (preferred). */
        payeeId: string;
        /** @deprecated Alias for payeeId — kept for older deep links. */
        payeeKey?: string;
        payeeKeysTop: string[];
        payeeDisplayName: string;
        fromIso?: string;
        toIso?: string;
      }
    | {
        filter: "category";
        year: number;
        monthIndex0: number;
        categoryId: string;
        categoryDisplayName: string;
        fromIso?: string;
        toIso?: string;
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
  WelcomeTour: undefined;
  Auth: undefined;
  ProfileSetup: undefined;
  SmsInboxReview: undefined;
  Main: NavigatorScreenParams<MainStackParamList>;
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
