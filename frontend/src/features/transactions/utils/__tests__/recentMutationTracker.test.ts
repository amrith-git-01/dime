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

  describe("echo suppression", () => {
    it("drops only the event whose updated_at equals the one the server gave this device's write", () => {
      const tracker = createRecentMutationTracker(5_000, () => 0);
      tracker.mark("a", "2026-10-15T08:00:05.000Z");
      expect(tracker.isEcho("a", { updatedAt: "2026-10-15T08:00:05.000Z" })).toBe(true);
      // Another device edited the same row a moment later: not an echo, it must be applied.
      expect(tracker.isEcho("a", { updatedAt: "2026-10-15T08:00:07.000Z" })).toBe(false);
      expect(tracker.isEcho("a", {})).toBe(false);
      expect(tracker.isEcho("b", { updatedAt: "2026-10-15T08:00:05.000Z" })).toBe(false);
    });

    it("compares instants, not spellings (a +00:00 offset is the same moment as Z)", () => {
      const tracker = createRecentMutationTracker(5_000, () => 0);
      tracker.mark("a", "2026-10-15T08:00:05.000Z");
      expect(tracker.isEcho("a", { updatedAt: "2026-10-15T08:00:05+00:00" })).toBe(true);
    });

    it("a delete has no updated_at: only an event that removes the row is its echo", () => {
      const tracker = createRecentMutationTracker(5_000, () => 0);
      tracker.mark("a");
      expect(tracker.isEcho("a", { removal: true })).toBe(true);
      // Somebody restored or edited it elsewhere: apply it.
      expect(tracker.isEcho("a", { updatedAt: "2026-10-15T08:00:07.000Z" })).toBe(false);
    });

    it("stops being an echo after the window", () => {
      let clock = 0;
      const tracker = createRecentMutationTracker(5_000, () => clock);
      tracker.mark("a", "2026-10-15T08:00:05.000Z");
      clock = 5_000;
      expect(tracker.isEcho("a", { updatedAt: "2026-10-15T08:00:05.000Z" })).toBe(false);
    });
  });

  it("clear forgets every id", () => {
    const tracker = createRecentMutationTracker(1_000, () => 0);
    tracker.mark("a");
    tracker.clear();
    expect(tracker.isRecent("a")).toBe(false);
  });
});
