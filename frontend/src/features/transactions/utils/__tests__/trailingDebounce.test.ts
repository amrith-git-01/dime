import { createTrailingDebounce } from "../trailingDebounce";

describe("createTrailingDebounce", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("coalesces a burst into one trailing run", () => {
    const run = jest.fn();
    const debounced = createTrailingDebounce(run, 300);

    debounced.schedule();
    jest.advanceTimersByTime(200);
    debounced.schedule();
    jest.advanceTimersByTime(200);
    expect(run).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs again for a later burst", () => {
    const run = jest.fn();
    const debounced = createTrailingDebounce(run, 300);

    debounced.schedule();
    jest.advanceTimersByTime(300);
    debounced.schedule();
    jest.advanceTimersByTime(300);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("cancel drops the pending run", () => {
    const run = jest.fn();
    const debounced = createTrailingDebounce(run, 300);

    debounced.schedule();
    debounced.cancel();
    jest.advanceTimersByTime(1_000);
    expect(run).not.toHaveBeenCalled();
  });
});
