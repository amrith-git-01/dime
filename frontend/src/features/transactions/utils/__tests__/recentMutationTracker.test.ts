import { createRecentMutationTracker } from "../recentMutationTracker";

describe("createRecentMutationTracker", () => {
  it("treats a marked id as recent until the ttl elapses", () => {
    let clock = 1_000;
    const tracker = createRecentMutationTracker(5_000, () => clock);

    expect(tracker.isRecent("a")).toBe(false);
    tracker.mark("a");
    expect(tracker.isRecent("a")).toBe(true);
    expect(tracker.isRecent("b")).toBe(false);

    clock += 4_999;
    expect(tracker.isRecent("a")).toBe(true);
    clock += 1;
    expect(tracker.isRecent("a")).toBe(false);
  });

  it("restarts the window when an id is marked again", () => {
    let clock = 0;
    const tracker = createRecentMutationTracker(1_000, () => clock);

    tracker.mark("a");
    clock = 900;
    tracker.mark("a");
    clock = 1_800;
    expect(tracker.isRecent("a")).toBe(true);
  });

  it("clear forgets every id", () => {
    const tracker = createRecentMutationTracker(1_000, () => 0);
    tracker.mark("a");
    tracker.clear();
    expect(tracker.isRecent("a")).toBe(false);
  });
});
