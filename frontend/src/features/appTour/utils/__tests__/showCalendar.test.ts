import { useTransactionsViewStore } from "@/stores/transactionsViewStore";

import { transactionsTour } from "../../constants/tabTours";
import { runTourEnterActions } from "../tourNavigation";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/navigation/navigationRef", () => ({
  navigationRef: { isReady: () => false, getCurrentRoute: () => undefined, navigate: jest.fn() },
}));

describe("the Transactions tour on a list-first tab", () => {
  beforeEach(() => useTransactionsViewStore.setState({ mode: "list" }));

  it("the tab shows the list until something asks for the calendar", () => {
    expect(useTransactionsViewStore.getState().mode).toBe("list");
  });

  it("showCalendar switches the tab to the calendar", () => {
    runTourEnterActions(["showCalendar"]);
    expect(useTransactionsViewStore.getState().mode).toBe("calendar");
  });

  it("every step that spotlights the calendar view switches to it first", () => {
    const calendarSteps = transactionsTour.steps.filter(
      (step) =>
        step.screen !== "TransactionDetail" &&
        step.kind !== "finale" &&
        step.targetId !== undefined,
    );
    expect(calendarSteps.length).toBeGreaterThan(0);
    for (const step of calendarSteps) {
      expect(step.enter).toContain("showCalendar");
    }
  });
});
