import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { navigationRef } from "@/navigation/navigationRef";
import type { MainStackParamList } from "@/navigation/types";

import type { AgentDeepLink } from "../types";

type TransactionsListParams = MainStackParamList["TransactionsList"];

function parseRangeIso(
  params: Record<string, unknown>,
): { fromIso: string; toIso: string } | null {
  const fromIso = params.fromIso;
  const toIso = params.toIso;
  if (typeof fromIso !== "string" || typeof toIso !== "string") {
    return null;
  }
  if (!fromIso.trim() || !toIso.trim()) {
    return null;
  }
  return { fromIso, toIso };
}

function parsePayeeId(params: Record<string, unknown>): string | null {
  const payeeId = params.payeeId ?? params.payeeKey;
  if (typeof payeeId !== "string") {
    return null;
  }
  const trimmed = payeeId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toTransactionsListParams(
  params: Record<string, unknown>,
): TransactionsListParams | null {
  const filter = params.filter;
  const year = Number(params.year);
  const monthIndex0 = Number(params.monthIndex0);
  const range = parseRangeIso(params);

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
      ...(range ?? {}),
    };
  }

  if (
    filter === "payee" &&
    Number.isFinite(year) &&
    Number.isFinite(monthIndex0) &&
    parsePayeeId(params) !== null &&
    typeof params.payeeDisplayName === "string" &&
    Array.isArray(params.payeeKeysTop)
  ) {
    const payeeId = parsePayeeId(params)!;
    return {
      filter: "payee",
      year,
      monthIndex0,
      payeeId,
      payeeKey: payeeId,
      payeeDisplayName: params.payeeDisplayName,
      payeeKeysTop: params.payeeKeysTop.map(String),
      ...(range ?? {}),
    };
  }

  return null;
}

type MainStackNavigation = NativeStackNavigationProp<MainStackParamList>;

/**
 * Navigate to TransactionsList from an agent deep_link payload.
 * Prefer passing the Main stack navigator from the tab shell (same as Insights).
 */
export function navigateAgentDeepLink(
  link: AgentDeepLink,
  navigation?: MainStackNavigation,
): boolean {
  if (link.screen !== "TransactionsList") {
    return false;
  }

  const listParams = toTransactionsListParams(link.params);
  if (!listParams) {
    return false;
  }

  if (navigation) {
    navigation.navigate("TransactionsList", listParams);
    return true;
  }

  if (!navigationRef.isReady()) {
    return false;
  }

  navigationRef.navigate("Main", {
    screen: "TransactionsList",
    params: listParams,
  });
  return true;
}
