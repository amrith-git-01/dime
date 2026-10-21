import { TOUR_ORDER } from "../../constants/tourRegistry";
import type { TourId } from "../../constants/tourTypes";
import { buildTourRows, toursProgressLabel } from "../tourRows";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

describe("Settings → Tours rows", () => {
  it("lists every tour, first-expense included, in order, each with icon, title and length", () => {
    const rows = buildTourRows(new Set<TourId>());
    expect(rows.map((row) => row.id)).toEqual([...TOUR_ORDER]);
    expect(rows[0].id).toBe("firstExpense");
    for (const row of rows) {
      expect(row.title.length).toBeGreaterThan(0);
      expect(row.durationLabel).toMatch(/^~\d+ s$/);
      expect(row.icon).toBeDefined();
      expect(row.seen).toBe(false);
    }
  });

  it("marks the tours that were seen", () => {
    const rows = buildTourRows(new Set<TourId>(["home", "askAi"]));
    expect(rows.filter((row) => row.seen).map((row) => row.id)).toEqual(["home", "askAi"]);
  });

  it("words the progress as '4 of 7 done'", () => {
    expect(toursProgressLabel(4, 7)).toBe("4 of 7 done");
    expect(toursProgressLabel(0, TOUR_ORDER.length)).toBe("0 of 7 done");
  });
});
