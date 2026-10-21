import { popTourScreens } from "../tourNavigation";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

let mockRoute: string | undefined;
const mockNavigate = jest.fn();
jest.mock("@/navigation/navigationRef", () => ({
  navigationRef: {
    isReady: () => mockRoute !== undefined,
    getCurrentRoute: () => (mockRoute ? { name: mockRoute } : undefined),
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
}));

describe("popTourScreens (when a tour ends)", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it.each([
    ["home", "TransactionDetail", "Home"],
    ["budgets", "TransactionsList", "Budgets"],
    ["budgets", "RecurringEditor", "Budgets"],
    ["insights", "InsightsMonthCompare", "Insights"],
    ["insights", "TransactionsList", "Insights"],
  ] as const)("%s: closes %s and returns to %s", (tourId, screen, tab) => {
    mockRoute = screen;
    popTourScreens(tourId);
    expect(mockNavigate).toHaveBeenCalledWith("Main", {
      screen: "MainTabs",
      params: { screen: tab },
      // Pop back to the tabs that are already there, never push a second copy of them.
      pop: true,
    });
  });

  it("does nothing on a tab, or somewhere the tour does not own (Settings stays open)", () => {
    for (const route of ["Home", "Budgets", "Settings", "SettingsTours", "ManualAddTransaction"]) {
      mockRoute = route;
      popTourScreens("home");
    }
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does nothing before navigation is ready", () => {
    mockRoute = undefined;
    popTourScreens("home");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("a screen another tour visits is not this tour's to close", () => {
    mockRoute = "InsightsMonthCompare";
    popTourScreens("home");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
