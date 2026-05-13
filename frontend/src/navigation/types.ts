import type { NavigatorScreenParams } from "@react-navigation/native";

import type { TransactionRow } from "@/features/transactions/types";

export type MainTabParamList = {
  Home: undefined;
  Transactions: undefined;
  Budgets: undefined;
  Insights: undefined;
};

export type MainStackParamList = {
  MainTabs: undefined;
  Settings: undefined;
  Notifications: undefined;
  ManualAddTransaction: undefined;
  TransactionDetail: { transaction: TransactionRow };
};

export type RootStackParamList = {
  Auth: undefined;
  ProfileSetup: undefined;
  Main: NavigatorScreenParams<MainStackParamList>;
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
