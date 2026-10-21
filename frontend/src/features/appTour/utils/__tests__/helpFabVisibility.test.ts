import type { TourId } from "../../constants/tourTypes";
import { resolveTourHelpFab } from "../helpFabVisibility";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const seen = (...ids: TourId[]) => new Set<TourId>(ids);

describe("the floating ? button", () => {
  it("shows on a tab whose tour has not been seen, and opens that tab's tour", () => {
    expect(resolveTourHelpFab({ tab: "Home", seen: seen("firstExpense") })).toEqual({
      show: true,
      tourId: "home",
    });
    expect(
      resolveTourHelpFab({ tab: "Budgets", seen: seen("firstExpense", "home") }),
    ).toEqual({ show: true, tourId: "budgets" });
  });

  it("is gone once that tab's tour was watched or skipped", () => {
    expect(
      resolveTourHelpFab({ tab: "Home", seen: seen("firstExpense", "home") }),
    ).toEqual({ show: false, tourId: "home" });
  });

  it("is per tab: another tab's seen tour does not hide this tab's", () => {
    expect(
      resolveTourHelpFab({
        tab: "Insights",
        seen: seen("firstExpense", "home", "budgets"),
      }).show,
    ).toBe(true);
  });

  it("waits for the first-run tour to have had its turn", () => {
    expect(resolveTourHelpFab({ tab: "Home", seen: seen() }).show).toBe(false);
  });

  it("is not on a screen that is not a main tab", () => {
    expect(resolveTourHelpFab({ tab: null, seen: seen("firstExpense") })).toEqual({
      show: false,
      tourId: null,
    });
  });
});
