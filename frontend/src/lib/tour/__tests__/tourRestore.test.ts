import {
  captureTourState,
  registerTourRestorable,
  restoreTourState,
} from "../tourRestoreRegistry";

describe("tour state restore", () => {
  it("captures what screens show when a tour starts and puts it back when it ends", () => {
    let month = 2;
    const unregister = registerTourRestorable("test.month", {
      snapshot: () => month,
      restore: (value) => {
        month = value as number;
      },
    });
    const captured = captureTourState();
    month = 9; // the tour changed it
    restoreTourState(captured);
    expect(month).toBe(2);
    unregister();
  });

  it("skips screens that are no longer mounted, and never restores a screen that registered later", () => {
    const restore = jest.fn();
    const unregister = registerTourRestorable("test.gone", { snapshot: () => 1, restore });
    const captured = captureTourState();
    unregister();
    restoreTourState(captured);
    expect(restore).not.toHaveBeenCalled();

    const late = jest.fn();
    const unregisterLate = registerTourRestorable("test.late", { snapshot: () => 1, restore: late });
    restoreTourState(captured);
    expect(late).not.toHaveBeenCalled();
    unregisterLate();
  });
});
