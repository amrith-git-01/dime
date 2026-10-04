import { createDeltaBatcher } from "../createDeltaBatcher";

describe("createDeltaBatcher", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("coalesces many deltas into one flush per interval", () => {
    const flush = jest.fn();
    const batcher = createDeltaBatcher(flush, 50);
    batcher.push("a");
    batcher.push("b");
    batcher.push("c");
    expect(flush).not.toHaveBeenCalled();
    jest.advanceTimersByTime(50);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith("abc");
    batcher.push("d");
    jest.advanceTimersByTime(50);
    expect(flush).toHaveBeenLastCalledWith("d");
  });

  it("cancel drops pending text", () => {
    const flush = jest.fn();
    const batcher = createDeltaBatcher(flush, 50);
    batcher.push("a");
    batcher.cancel();
    jest.advanceTimersByTime(200);
    expect(flush).not.toHaveBeenCalled();
  });
});
