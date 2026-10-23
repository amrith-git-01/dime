import { bumpUserDataEpoch, currentUserDataEpoch, trackAbortable } from "../userDataEpoch";

describe("user data epoch", () => {
  it("a wipe bumps the epoch and aborts tracked requests, but not ones already finished", () => {
    const running = new AbortController();
    const done = new AbortController();
    trackAbortable(running);
    trackAbortable(done)();
    const before = currentUserDataEpoch();
    bumpUserDataEpoch();
    expect(currentUserDataEpoch()).toBe(before + 1);
    expect(running.signal.aborted).toBe(true);
    expect(done.signal.aborted).toBe(false);
  });
});
