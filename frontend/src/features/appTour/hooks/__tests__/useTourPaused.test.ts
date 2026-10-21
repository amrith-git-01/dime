import { isTourPaused } from "../useTourPaused";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const paused = (
  tourId: Parameters<typeof isTourPaused>[0]["tourId"],
  routeName: string | undefined,
  agentOpen = false,
  captureOpen = false,
) => isTourPaused({ tourId, routeName, agentOpen, captureOpen });

describe("the tour pause rule", () => {
  it("shows a tab tour on its own tab and on the screens it visits", () => {
    expect(paused("home", "Home")).toBe(false);
    expect(paused("home", "TransactionDetail")).toBe(false);
    expect(paused("transactions", "Transactions")).toBe(false);
    expect(paused("transactions", "TransactionDetail")).toBe(false);
    expect(paused("budgets", "RecurringEditor")).toBe(false);
    expect(paused("budgets", "TransactionsList")).toBe(false);
    expect(paused("insights", "InsightsMonthCompare")).toBe(false);
  });

  it("pauses a tab tour anywhere it does not own", () => {
    expect(paused("home", "Budgets")).toBe(true);
    expect(paused("home", "Insights")).toBe(true);
    expect(paused("home", "Settings")).toBe(true);
    expect(paused("home", "SettingsTours")).toBe(true);
    expect(paused("home", "ManualAddTransaction")).toBe(true);
    expect(paused("home", "EditTransaction")).toBe(true);
    expect(paused("home", "Notifications")).toBe(true);
    // A screen another tour visits is not this tour's.
    expect(paused("home", "RecurringEditor")).toBe(true);
    expect(paused("home", "InsightsMonthCompare")).toBe(true);
  });

  it("pauses while navigation is not ready", () => {
    expect(paused("home", undefined)).toBe(true);
  });

  it("the first-run tour and the + menu tour work over any tab, but pause off the tabs", () => {
    for (const id of ["firstExpense", "addMenu"] as const) {
      for (const tab of ["Home", "Transactions", "Budgets", "Insights"]) {
        expect(paused(id, tab)).toBe(false);
      }
      expect(paused(id, "ManualAddTransaction")).toBe(true);
      expect(paused(id, "Settings")).toBe(true);
    }
  });

  it("voice capture and the receipt scan pause every tour, Ask AI included", () => {
    for (const id of ["home", "firstExpense", "addMenu", "askAi"] as const) {
      expect(paused(id, "Home", false, true)).toBe(true);
      expect(paused(id, "Home", true, true)).toBe(true);
    }
  });

  it("the Ask AI chat pauses a tour, except the one that opened it (Ask AI)", () => {
    expect(paused("home", "Home", true)).toBe(true);
    expect(paused("firstExpense", "Home", true)).toBe(true);
    expect(paused("addMenu", "Home", true)).toBe(true);
    expect(paused("askAi", "Home", true)).toBe(false);
    expect(paused("askAi", "Budgets", true)).toBe(false);
  });

  it("Ask AI still pauses off the tabs", () => {
    expect(paused("askAi", "Settings", true)).toBe(true);
  });
});
