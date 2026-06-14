import { CommonActions } from "@react-navigation/native";

import { navigationRef } from "@/navigation/navigationRef";
import type { MainStackParamList } from "@/navigation/types";

import type { AgentDeepLink } from "../types";

type TransactionsListParams = MainStackParamList["TransactionsList"];

function toTransactionsListParams(
  params: Record<string, unknown>,
): TransactionsListParams | null {
  const filter = params.filter;
  const year = Number(params.year);
  const monthIndex0 = Number(params.monthIndex0);

  if (
    filter === "day" &&
    Number.isFinite(year) &&
    Number.isFinite(monthIndex0) &&
    typeof params.dayKey === "string"
  ) {
    return {
      filter: "day",
      year,
      monthIndex0,
      dayKey: params.dayKey,
    };
  }

  if (
    filter === "category" &&
    Number.isFinite(year) &&
    Number.isFinite(monthIndex0) &&
    typeof params.categoryId === "string" &&
    typeof params.categoryDisplayName === "string"
  ) {
    return {
      filter: "category",
      year,
      monthIndex0,
      categoryId: params.categoryId,
      categoryDisplayName: params.categoryDisplayName,
    };
  }

  if (
    filter === "payee" &&
    Number.isFinite(year) &&
    Number.isFinite(monthIndex0) &&
    typeof params.payeeKey === "string" &&
    typeof params.payeeDisplayName === "string" &&
    Array.isArray(params.payeeKeysTop)
  ) {
    return {
      filter: "payee",
      year,
      monthIndex0,
      payeeKey: params.payeeKey,
      payeeDisplayName: params.payeeDisplayName,
      payeeKeysTop: params.payeeKeysTop.map(String),
    };
  }

  return null;
}

/** Navigate from agent ``deep_link`` payload when screen is supported. */
export function navigateAgentDeepLink(link: AgentDeepLink): boolean {
  if (!navigationRef.isReady()) {
    return false;
  }

  if (link.screen !== "TransactionsList") {
    return false;
  }

  const listParams = toTransactionsListParams(link.params);
  if (!listParams) {
    return false;
  }

  navigationRef.dispatch(
    CommonActions.navigate({
      name: "Main",
      params: {
        screen: "TransactionsList",
        params: listParams,
      },
    }),
  );
  return true;
}
