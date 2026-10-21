import { TOUR_ORDER } from "../../constants/tourRegistry";
import { isAgentEntryFabHiddenByTour } from "../agentFabVisibility";

describe("the Ask AI entry button during tours", () => {
  it("is never hidden when no tour runs", () => {
    for (const id of TOUR_ORDER) {
      expect(isAgentEntryFabHiddenByTour(false, id)).toBe(false);
    }
  });

  it("is hidden while any tour but Ask AI runs", () => {
    for (const id of TOUR_ORDER.filter((tourId) => tourId !== "askAi")) {
      expect(isAgentEntryFabHiddenByTour(true, id)).toBe(true);
    }
  });

  it("stays in the Ask AI tour, where the panel is the stage", () => {
    expect(isAgentEntryFabHiddenByTour(true, "askAi")).toBe(false);
  });
});
