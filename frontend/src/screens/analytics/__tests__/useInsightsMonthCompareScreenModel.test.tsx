import type { ReactElement } from "react";

import { manualItem } from "@/lib/outbox/__tests__/fixtures";
import { useOutboxStore } from "@/stores/outboxStore";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { useInsightsMonthCompareScreenModel } from "../useInsightsMonthCompareScreenModel";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ setOptions: jest.fn() }),
  useRoute: () => ({
    params: {
      monthA: { year: 2026, monthIndex0: 9, label: "October 2026" },
      monthB: { year: 2026, monthIndex0: 8, label: "September 2026" },
    },
  }),
}));
jest.mock("@/features/analytics/hooks/useMonthInsightsQuery", () => ({
  useMonthInsightsQuery: () => ({
    data: {
      summary: { transaction_count: 3, credit_total: "1000.00", debit_total: "600.00", net: "400.00" },
      daily_cashflow: [],
      counterparty_spend: [],
    },
    isPending: false,
    isError: false,
  }),
}));
jest.mock("@/features/transactions/hooks/useTransactionsOverviewQueries", () => ({
  useMonthSummaryQuery: () => ({ data: undefined, isPending: false }),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

type Model = ReturnType<typeof useInsightsMonthCompareScreenModel>;

async function mountModel() {
  let model!: Model;
  function Probe() {
    model = useInsightsMonthCompareScreenModel();
    return null;
  }
  let rendered!: ReturnType<typeof create>;
  await act(async () => {
    rendered = create(<Probe />);
  });
  return { model, unmount: () => act(async () => rendered.unmount()) };
}

describe("useInsightsMonthCompareScreenModel pending overlay", () => {
  beforeEach(() => {
    resetMockMmkv();
    useOutboxStore.getState().reset();
  });
  afterEach(() => useOutboxStore.getState().reset());

  it("adds the waiting entry to the month it falls in only", async () => {
    // 250 saved offline in October 2026: month A (October) shows it, month B (September) does not.
    useOutboxStore.getState().hydrate("u1");
    useOutboxStore.getState().add("u1", manualItem());
    const { model, unmount } = await mountModel();
    expect(model.monthASpent).toBe(850);
    expect(model.monthBSpent).toBe(600);
    expect(model.monthA.summary?.spentDisplay).toContain("850");
    expect(model.monthB.summary?.spentDisplay).toContain("600");
    await unmount();
  });
});
