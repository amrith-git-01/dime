import { pickTourCompletionCelebration } from "../tourCelebrations";

const base = { replay: false, firstTime: true, allDone: false, celebratesFirstRun: true };

describe("how a finished tour celebrates", () => {
  it("the first time through gets the big confetti", () => {
    expect(pickTourCompletionCelebration(base)).toBe("full");
  });

  it("finishing the last unseen tour is the grand moment", () => {
    expect(pickTourCompletionCelebration({ ...base, allDone: true })).toBe("grand");
  });

  it("a replay only ever gets the lighter confetti, even when everything else would be big", () => {
    expect(pickTourCompletionCelebration({ ...base, replay: true })).toBe("medium");
    expect(
      pickTourCompletionCelebration({ ...base, replay: true, allDone: true, firstTime: true }),
    ).toBe("medium");
  });

  it("a tour seen before gets the lighter confetti", () => {
    expect(pickTourCompletionCelebration({ ...base, firstTime: false })).toBe("medium");
  });

  it("a tour that does not celebrate its first run gets the lighter confetti", () => {
    expect(pickTourCompletionCelebration({ ...base, celebratesFirstRun: false })).toBe("medium");
  });
});
