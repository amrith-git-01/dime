import type { ReactElement } from "react";

import { categoryDefault } from "@/constants";
import { ThemeProvider } from "@/theme/ThemeProvider";

import type { ForecastActions, ForecastResponse } from "../../types";

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: ReactElement) => Rendered;
};
export { act };
/* eslint-enable @typescript-eslint/no-require-imports */

type TestNode = { props: Record<string, unknown> };
type Json = string | { children?: Json[] | null } | null;

export type Rendered = {
  root: {
    findAll: (predicate: (node: TestNode) => boolean) => TestNode[];
  };
  toJSON: () => Json | Json[];
  unmount: () => void;
};

export function render(element: ReactElement): Rendered {
  let tree!: Rendered;
  act(() => {
    tree = create(<ThemeProvider>{element}</ThemeProvider>);
  });
  return tree;
}

export function press(tree: Rendered, label: string): void {
  const target = tree.root
    .findAll(
      (node) =>
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === "function",
    )
    .at(0);
  if (!target) throw new Error(`no pressable labelled "${label}"`);
  act(() => {
    (target.props.onPress as () => void)();
  });
}

export function hasPressable(tree: Rendered, label: string): boolean {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === "function",
  ).length > 0;
}

/** Every string the tree renders, in order. */
export function textOf(tree: Rendered): string[] {
  const out: string[] = [];
  const walk = (node: Json | Json[] | undefined | null): void => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (typeof node === "string") {
      out.push(node);
    } else {
      node.children?.forEach(walk);
    }
  };
  walk(tree.toJSON());
  return out;
}

export const joinedText = (tree: Rendered): string => textOf(tree).join(" ");

export function makeForecast(over: Partial<ForecastResponse> = {}): ForecastResponse {
  return {
    year: 2026,
    month: 10,
    today: "2026-10-22",
    timezone: "Asia/Kolkata",
    mode: "full",
    historyDays: 96,
    landing: {
      p10: "27100.00",
      p50: "28900.00",
      p90: "31200.00",
      budget: "30000.00",
      chanceUnder: 0.71,
      spentSoFar: "18620.00",
      billsStillDue: "1200.00",
      flexibleRemaining: "9080.00",
    },
    safeToday: { amount: "840.00", usualForWeekday: "520.00", weekday: "Thu" },
    categories: [
      {
        id: "c-food",
        name: "Food",
        iconName: "UtensilsCrossed",
        color: categoryDefault,
        spent: "6100.00",
        p50: "7900.00",
        budget: "8000.00",
        baseline: "6200.00",
        status: "hot",
      },
      {
        id: "c-shop",
        name: "Shopping",
        iconName: "ShoppingBag",
        color: categoryDefault,
        spent: "5030.00",
        p50: "6400.00",
        budget: "6000.00",
        baseline: null,
        status: "over",
      },
      {
        id: null,
        name: "Uncategorized",
        iconName: null,
        color: null,
        spent: "100.00",
        p50: "150.00",
        budget: null,
        baseline: null,
        status: "ok",
      },
    ],
    upcoming: [
      { id: "u-bill", kind: "bill", name: "Netflix", amount: "649.00", date: "2026-10-24" },
      { id: "u-swiggy", kind: "likely", name: "Swiggy", amount: "350.00", date: "2026-10-23", payeeKey: "swiggy", confidence: 0.82 },
      { id: "u-salary", kind: "income", name: "Salary", amount: "52000.00", date: "2026-11-01" },
    ],
    watch: [
      { id: "hot:c-food", kind: "category_hot", text: "Food is heading for ₹7.9k; you usually spend ₹6.2k.", categoryId: "c-food" },
      { id: "unusual:t1", kind: "unusual", text: "₹1,899 at Amazon is about 3x your usual there.", transactionId: "t1", payeeKey: "amazon", amount: "1899.00" },
      { id: "sub:spotify", kind: "subscription_candidate", text: "Spotify, ₹119 monthly. Track it as recurring?", payeeKey: "spotify", name: "Spotify", cadence: "monthly", amount: "119.00" },
    ],
    summary: "On track: likely ₹28.9k against ₹30k.",
    accuracy: { lastMonthErrorPct: 5.4 },
    ...over,
  };
}

export function makeActions(): { [K in keyof ForecastActions]: jest.Mock } {
  return {
    onConfirmLikely: jest.fn(),
    onDismissLikely: jest.fn(),
    onSeeCategoryTransactions: jest.fn(),
    onDismissCategoryWatch: jest.fn(),
    onOpenUnusual: jest.fn(),
    onMarkOneOff: jest.fn(),
    onMarkNotUnusual: jest.fn(),
    onTrackRecurring: jest.fn(),
    onDismissSubscription: jest.fn(),
    onOpenCategory: jest.fn(),
  };
}
