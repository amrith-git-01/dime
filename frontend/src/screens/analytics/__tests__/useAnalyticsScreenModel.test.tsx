import type { ReactElement } from "react";

import { useAnalyticsScreenModel } from "../useAnalyticsScreenModel";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock("@/components/bento", () => ({
  useBentoMonthSelection: () => ({
    monthOptions: [{ label: "Oct 2026", year: 2026, monthIndex0: 9 }],
    selectedMonth: { label: "Oct 2026", year: 2026, monthIndex0: 9 },
    selectMonth: jest.fn(),
  }),
}));

const spend = [
  { payee_key: "cafe", display_name: "Cafe", debit_total: "300.00", share: 0.5, transaction_count: 1 },
  { payee_key: "__other__", display_name: "Other", debit_total: "300.00", share: 0.5, transaction_count: 2 },
];
const income = [
  { payee_key: "acme", display_name: "Acme", credit_total: "900.00", share: 0.9, transaction_count: 1 },
  { payee_key: "__other__", display_name: "Other", credit_total: "100.00", share: 0.1, transaction_count: 2 },
];
jest.mock("@/features/analytics/hooks/useMonthInsightsQuery", () => ({
  useMonthInsightsQuery: () => ({
    data: {
      summary: { transaction_count: 3, credit_total: "1000", debit_total: "600", net: "400" },
      daily_cashflow: [],
      counterparty_spend: spend,
      counterparty_income: income,
      top_expenses: [],
    },
    isPending: false,
    isError: false,
    isPlaceholderData: false,
  }),
}));
jest.mock("@/features/budgets/hooks/useBudget", () => ({
  useBudgetQuery: () => ({ data: { budget: null }, isPending: false }),
}));
jest.mock("@/features/recurring/hooks/useRecurringMonthQuery", () => ({
  useRecurringMonthQuery: () => ({
    data: undefined,
    isError: true,
    isSuccess: false,
    isPlaceholderData: false,
  }),
}));
jest.mock("@/features/analytics/hooks/useDeferredHeavyCharts", () => ({
  useDeferredHeavyCharts: () => ({ chartsReady: true }),
}));
jest.mock("@/hooks/useCurrentDay", () => ({ useCurrentDay: () => 23 }));
jest.mock("@/hooks/useTourCommand", () => ({ useTourCommand: jest.fn() }));
jest.mock("@/hooks/useTourRestorable", () => ({ useTourRestorable: jest.fn() }));
jest.mock("@/hooks/useTransactionQuickAddActions", () => ({
  useTransactionQuickAddActions: () => ({
    onManualAdd: jest.fn(),
    onReceipt: jest.fn(),
    onVoice: jest.fn(),
  }),
}));
jest.mock("@/lib/tour/tourEvents", () => ({
  emitTourEvent: jest.fn(),
  tourEventNames: { payeeOpened: "payeeOpened", transactionOpened: "transactionOpened" },
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

type Model = ReturnType<typeof useAnalyticsScreenModel>;

async function mountModel() {
  let model!: Model;
  function Probe() {
    model = useAnalyticsScreenModel();
    return null;
  }
  let rendered!: ReturnType<typeof create>;
  await act(async () => {
    rendered = create(<Probe />);
  });
  return { model, unmount: () => act(async () => rendered.unmount()) };
}

const slice = (payee_key: string, display_name: string) =>
  ({ payee_key, display_name }) as Parameters<Model["openTransactionsListForPayer"]>[0];

describe("useAnalyticsScreenModel payee navigation", () => {
  beforeEach(() => mockNavigate.mockClear());

  it("opens a payer as credits with the income donut's own top keys", async () => {
    const { model, unmount } = await mountModel();
    model.openTransactionsListForPayer(slice("__other__", "Other"));
    expect(mockNavigate).toHaveBeenCalledWith("TransactionsList", {
      filter: "payee",
      year: 2026,
      monthIndex0: 9,
      payeeId: "__other__",
      payeeDisplayName: "Other",
      payeeKeysTop: ["acme"],
      direction: "credit",
    });
    await unmount();
  });

  it("keeps a spend payee as debits with the spend top keys", async () => {
    const { model, unmount } = await mountModel();
    model.openTransactionsListForPayee(slice("cafe", "Cafe"));
    const [, params] = mockNavigate.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).toMatchObject({ payeeId: "cafe", payeeKeysTop: ["cafe"] });
    expect(params).not.toHaveProperty("direction");
    await unmount();
  });
});
