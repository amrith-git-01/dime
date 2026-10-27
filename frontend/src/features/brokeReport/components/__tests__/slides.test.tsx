import type { ComponentType } from "react";
import { useSharedValue } from "react-native-reanimated";

import { ThemeProvider } from "@/theme/ThemeProvider";
import { resolveReportCopy } from "../../copy";
import {
  FULL_SNAPSHOT,
  MINIMAL_SNAPSHOT,
  SAMPLE_SNAPSHOT,
} from "../../__fixtures__/reportFixtures";
import { REPORT_ROAST_LEVELS } from "@/features/settings/types";
import type { ReportSlideId, ReportSnapshot } from "../../types";
import { SLIDE_TONE } from "../../utils/slideTones";
import { resolveSlides, slideDurationMs } from "../../utils/storyLogic";
import { ClosingSlide } from "../slides/ClosingSlide";
import { CoverSlide } from "../slides/CoverSlide";
import { DamageSlide } from "../slides/DamageSlide";
import { LineupSlide } from "../slides/LineupSlide";
import { MomentSlide } from "../slides/MomentSlide";
import { RegularSlide } from "../slides/RegularSlide";
import { RhythmSlide } from "../slides/RhythmSlide";
import type { SlideProps } from "../slides/slideParts";
import { WinSlide } from "../slides/WinSlide";
import { useTheme } from "@/theme";
import {
  renderTree,
  summaryLabel,
  textsOf,
  unmountTree,
} from "./testHarness";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerTickHaptic: jest.fn(() => Promise.resolve()),
  triggerConfirmHaptic: jest.fn(() => Promise.resolve()),
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  useFrameCallback: () => ({ setActive: () => undefined }),
}));

const SLIDES: Record<ReportSlideId, ComponentType<SlideProps>> = {
  cover: CoverSlide,
  damage: DamageSlide,
  lineup: LineupSlide,
  regular: RegularSlide,
  moment: MomentSlide,
  rhythm: RhythmSlide,
  win: WinSlide,
  closing: ClosingSlide,
};

/** The slide at the end of its timeline (the reduced-motion frame), on its own tone. */
function SlideHarness({
  id,
  snapshot,
  level,
  isSample = false,
}: {
  id: ReportSlideId;
  snapshot: ReportSnapshot;
  level: string;
  isSample?: boolean;
}) {
  const { colors } = useTheme();
  const duration = slideDurationMs(id);
  const clock = useSharedValue(duration);
  const Slide = SLIDES[id];
  return (
    <Slide
      snapshot={snapshot}
      copy={resolveReportCopy(snapshot, level, resolveSlides(snapshot).length)}
      tone={colors.report[SLIDE_TONE[id]]}
      clock={clock}
      initialMs={duration}
      isSample={isSample}
      staticFrames
    />
  );
}

async function renderSlide(
  id: ReportSlideId,
  snapshot: ReportSnapshot,
  level = "spicy",
  isSample = false,
) {
  return renderTree(
    <ThemeProvider>
      <SlideHarness id={id} snapshot={snapshot} level={level} isSample={isSample} />
    </ThemeProvider>,
  );
}

const ALL_IDS = Object.keys(SLIDES) as ReportSlideId[];

describe("slides, full month", () => {
  it.each(ALL_IDS)("%s renders with an accessible summary and no broken text", async (id) => {
    const tree = await renderSlide(id, FULL_SNAPSHOT);
    expect(tree.toJSON()).toBeTruthy();
    expect(summaryLabel(tree).length).toBeGreaterThan(10);
    for (const text of [...textsOf(tree), summaryLabel(tree)]) {
      expect(text).not.toMatch(/undefined|NaN|null|\[object/);
    }
    unmountTree(tree);
  });

  it("cover: month, year and the title earned", async () => {
    const tree = await renderSlide("cover", FULL_SNAPSHOT);
    const texts = textsOf(tree);
    expect(texts).toContain("October");
    expect(texts).toContain("2026");
    expect(texts).toContain("The Thousand Cuts Club");
    expect(texts).not.toContain("SAMPLE REPORT");
    unmountTree(tree);
  });

  it("cover: a sample wears its badge", async () => {
    const tree = await renderSlide("cover", SAMPLE_SNAPSHOT, "spicy", true);
    expect(textsOf(tree)).toContain("SAMPLE REPORT");
    unmountTree(tree);
  });

  it("damage: the spend as the hero, the chip against a usual month, full value for screen readers", async () => {
    const tree = await renderSlide("damage", FULL_SNAPSHOT);
    const texts = textsOf(tree);
    expect(texts).toContain("₹18.6k");
    expect(texts.some((t) => /₹1\.3k/.test(t))).toBe(true);
    expect(summaryLabel(tree)).toContain("18,620");
    unmountTree(tree);
  });

  it("damage: no chip when there is no usual month", async () => {
    const tree = await renderSlide("damage", MINIMAL_SNAPSHOT);
    expect(textsOf(tree).some((t) => /usual|normal/i.test(t))).toBe(false);
    unmountTree(tree);
  });

  it("lineup: the top category as the hero and every row with its share", async () => {
    const tree = await renderSlide("lineup", FULL_SNAPSHOT);
    const texts = textsOf(tree);
    expect(texts.filter((t) => t === "Food & Dining").length).toBeGreaterThanOrEqual(2);
    for (const share of ["40%", "18%", "16%", "26%"]) {
      expect(texts).toContain(share);
    }
    expect(texts).toContain("Other");
    unmountTree(tree);
  });

  it("regular: the payee, the visits and the total", async () => {
    const tree = await renderSlide("regular", FULL_SNAPSHOT);
    const texts = textsOf(tree);
    expect(texts).toContain("Corner Cafe");
    expect(texts).toContain("9");
    expect(texts).toContain("visits");
    expect(texts).toContain("₹2.2k in total");
    unmountTree(tree);
  });

  it("moment: the biggest spend and the busiest day", async () => {
    const tree = await renderSlide("moment", FULL_SNAPSHOT);
    const texts = textsOf(tree);
    expect(texts).toContain("₹4.2k");
    expect(texts).toContain("₹3.1k");
    unmountTree(tree);
  });

  it("moment: the busiest day leads when there is no biggest spend", async () => {
    const tree = await renderSlide("moment", { ...FULL_SNAPSHOT, biggest_spend: null });
    expect(textsOf(tree)).toContain("₹3.1k");
    expect(textsOf(tree)).not.toContain("₹4.2k");
    unmountTree(tree);
  });

  it("rhythm: the peak weekday as the hero, with seven bars", async () => {
    const tree = await renderSlide("rhythm", FULL_SNAPSHOT);
    const texts = textsOf(tree);
    expect(texts).toContain("Fridays");
    expect(texts.filter((t) => ["M", "T", "W", "F", "S"].includes(t))).toHaveLength(7);
    unmountTree(tree);
  });

  it.each([
    [
      "category_down",
      { kind: "category_down", category_id: "c", category_name: "Food & Dining", icon_name: null, color: null, amount: "7450.00", usual: "9100.00", delta: "1650.00" },
      "₹1.7k",
    ],
    [
      "no_spend_streak",
      { kind: "no_spend_streak", days: 5, start: "2026-10-05", end: "2026-10-09" },
      "5",
    ],
    [
      "lowest_month",
      { kind: "lowest_month", spent: "9400.00", previous_lowest: "12000.00", months_compared: 3 },
      "₹9.4k",
    ],
  ] as const)("win: %s has its own hero", async (_kind, win, hero) => {
    const tree = await renderSlide("win", { ...FULL_SNAPSHOT, win: win as ReportSnapshot["win"] });
    expect(textsOf(tree)).toContain(hero);
    unmountTree(tree);
  });

  it("closing: the title and three stats", async () => {
    const tree = await renderSlide("closing", FULL_SNAPSHOT);
    const texts = textsOf(tree);
    expect(texts).toContain("The Thousand Cuts Club");
    expect(texts).toEqual(expect.arrayContaining(["₹18.6k", "41", "₹7.5k"]));
    unmountTree(tree);
  });
});

describe("slides, minimal month", () => {
  const present = resolveSlides(MINIMAL_SNAPSHOT);

  it("plays cover, damage, lineup and closing", () => {
    expect(present).toEqual(["cover", "damage", "lineup", "closing"]);
  });

  it.each(present)("%s renders", async (id) => {
    const tree = await renderSlide(id, MINIMAL_SNAPSHOT);
    expect(tree.toJSON()).toBeTruthy();
    for (const text of [...textsOf(tree), summaryLabel(tree)]) {
      expect(text).not.toMatch(/undefined|NaN|null|\[object/);
    }
    unmountTree(tree);
  });

  it("cover explains a short month", async () => {
    const tree = await renderSlide("cover", MINIMAL_SNAPSHOT);
    const note = resolveReportCopy(MINIMAL_SNAPSHOT, "spicy", 4).sparseNote;
    expect(note).toMatch(/\S/);
    expect(textsOf(tree)).toContain(note);
    unmountTree(tree);
  });

  it.each(["regular", "moment", "win"] as const)(
    "%s draws nothing when the data is missing",
    async (id) => {
      const tree = await renderSlide(id, MINIMAL_SNAPSHOT);
      expect(tree.toJSON()).toBeNull();
      unmountTree(tree);
    },
  );
});

describe("slides at every roast level", () => {
  it.each(REPORT_ROAST_LEVELS)("%s renders the whole story", async (level) => {
    for (const id of resolveSlides(FULL_SNAPSHOT)) {
      const tree = await renderSlide(id, FULL_SNAPSHOT, level);
      expect(tree.toJSON()).toBeTruthy();
      unmountTree(tree);
    }
  });
});
