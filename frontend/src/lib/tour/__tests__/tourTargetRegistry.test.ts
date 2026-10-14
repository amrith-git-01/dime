import type { View } from "react-native";

import {
  isUsableTourRect,
  measureTourTarget,
  registerTourTarget,
  tourRectsEqual,
} from "../tourTargetRegistry";

describe("isUsableTourRect", () => {
  it("accepts a rect on screen", () => {
    expect(
      isUsableTourRect({ x: 10, y: 20, width: 100, height: 40 }, 390, 844),
    ).toBe(true);
  });

  it("rejects empty, non-finite and off-screen rects", () => {
    expect(
      isUsableTourRect({ x: 10, y: 20, width: 0, height: 40 }, 390, 844),
    ).toBe(false);
    expect(
      isUsableTourRect({ x: NaN, y: 20, width: 10, height: 40 }, 390, 844),
    ).toBe(false);
    expect(
      isUsableTourRect({ x: 10, y: 900, width: 100, height: 40 }, 390, 844),
    ).toBe(false);
    expect(
      isUsableTourRect({ x: -200, y: 20, width: 100, height: 40 }, 390, 844),
    ).toBe(false);
  });
});

describe("tourRectsEqual", () => {
  const a = { x: 10, y: 20, width: 100, height: 40 };

  it("treats sub-pixel differences as equal", () => {
    expect(tourRectsEqual(a, { ...a, x: 10.4, height: 40.3 })).toBe(true);
    expect(tourRectsEqual(a, { ...a, y: 22 })).toBe(false);
  });

  it("handles nulls", () => {
    expect(tourRectsEqual(null, null)).toBe(true);
    expect(tourRectsEqual(a, null)).toBe(false);
  });
});

describe("tour target registry", () => {
  function fakeView(rect: [number, number, number, number]) {
    return {
      current: {
        measureInWindow: (
          callback: (x: number, y: number, w: number, h: number) => void,
        ) => callback(...rect),
      } as unknown as View,
    };
  }

  it("measures a registered target and forgets it on unregister", async () => {
    const unregister = registerTourTarget("test.target", fakeView([1, 2, 3, 4]));
    await expect(measureTourTarget("test.target")).resolves.toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
    unregister();
    await expect(measureTourTarget("test.target")).resolves.toBeNull();
  });

  it("returns null for an unknown or unmounted target", async () => {
    await expect(measureTourTarget("test.unknown")).resolves.toBeNull();
    const unregister = registerTourTarget("test.unmounted", { current: null });
    await expect(measureTourTarget("test.unmounted")).resolves.toBeNull();
    unregister();
  });

  it("lets a later registration replace an earlier one without the old cleanup removing it", async () => {
    const first = registerTourTarget("test.shared", fakeView([0, 0, 10, 10]));
    const second = registerTourTarget("test.shared", fakeView([5, 5, 20, 20]));
    first();
    await expect(measureTourTarget("test.shared")).resolves.toEqual({
      x: 5,
      y: 5,
      width: 20,
      height: 20,
    });
    second();
  });
});
