import { isForegroundState, useAppIsActive, useScreenReaderEnabled } from "@/hooks/useAppEnvironment";
import { useClockValue } from "@/hooks/useClockValue";
import * as clockMotion from "@/utils/clockMotion";

import * as reelEnvironment from "@/features/onboarding/components/reel/reelEnvironment";
import * as reelMotion from "@/features/onboarding/components/reel/reelMotion";
import { useClockValue as reelUseClockValue } from "@/features/onboarding/components/reel/useClockValue";

jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
}));

/**
 * The story player and the Welcome reel share these helpers from `src/hooks` and `src/utils`; the
 * reel's own files re-export them, so neither side reaches into the other feature.
 */
describe("helpers shared by the story player and the reel", () => {
  it("are the same functions under both names", () => {
    expect(reelEnvironment.useAppIsActive).toBe(useAppIsActive);
    expect(reelEnvironment.useScreenReaderEnabled).toBe(useScreenReaderEnabled);
    expect(reelEnvironment.isForegroundState).toBe(isForegroundState);
    expect(reelUseClockValue).toBe(useClockValue);
    expect(reelMotion.seg).toBe(clockMotion.seg);
    expect(reelMotion.easeOut).toBe(clockMotion.easeOut);
    expect(reelMotion.easeIn).toBe(clockMotion.easeIn);
    expect(reelMotion.easeInOut).toBe(clockMotion.easeInOut);
    expect(reelMotion.easeOutBack).toBe(clockMotion.easeOutBack);
    expect(reelMotion.lerp).toBe(clockMotion.lerp);
  });

  it("only count an explicit background as not in the foreground", () => {
    expect(isForegroundState("active")).toBe(true);
    expect(isForegroundState(undefined)).toBe(true);
    expect(isForegroundState("background")).toBe(false);
    expect(isForegroundState("inactive")).toBe(false);
  });

  it("keep their easing maths", () => {
    expect(clockMotion.seg(50, 0, 100)).toBe(0.5);
    expect(clockMotion.seg(-5, 0, 100)).toBe(0);
    expect(clockMotion.easeOut(1)).toBe(1);
    expect(clockMotion.lerp(0, 10, 0.5)).toBe(5);
  });
});
