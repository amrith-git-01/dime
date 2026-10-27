import { StoryPlayer } from "../StoryPlayer";
import { ThemeProvider } from "@/theme/ThemeProvider";
import {
  FULL_SNAPSHOT,
  MINIMAL_SNAPSHOT,
} from "../../__fixtures__/reportFixtures";
import { resolveReportCopy } from "../../copy";
import { shareReportCard } from "../../utils/shareReport";
import type { ReportSnapshot } from "../../types";
import {
  press,
  pressAsync,
  pressables,
  renderTree,
  summaryLabel,
  textsOf,
  unmountTree,
  updateTree,
  type TestTree,
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
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  useFrameCallback: () => ({ setActive: () => undefined }),
}));
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual("react-native");
  // Every builder method returns the same chainable object; detectors just render children.
  const chain: Record<string, unknown> = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: {
      Pan: () => chain,
      LongPress: () => chain,
      Tap: () => chain,
      Simultaneous: () => chain,
      Exclusive: () => chain,
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});
jest.mock("@shopify/react-native-skia", () => ({
  ImageFormat: { PNG: 4 },
  makeImageFromView: jest.fn(),
}));
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  writeAsStringAsync: jest.fn(),
}));
jest.mock("../../utils/shareReport", () => ({ shareReportCard: jest.fn() }));
const mockToast = jest.fn();
jest.mock("@/features/toast/useToast", () => ({
  useToast: () => ({ showToast: mockToast }),
}));
// A screen reader is on: slides show their final frame and the Previous / Next buttons appear.
jest.mock("@/hooks/useAppEnvironment", () => ({
  useAppIsActive: () => true,
  useScreenReaderEnabled: () => true,
}));

const share = jest.mocked(shareReportCard);

async function renderPlayer(
  snapshot: ReportSnapshot = FULL_SNAPSHOT,
  props: Partial<React.ComponentProps<typeof StoryPlayer>> = {},
) {
  const onClose = jest.fn();
  const tree = await renderTree(
    <ThemeProvider>
      <StoryPlayer snapshot={snapshot} level="spicy" onClose={onClose} {...props} />
    </ThemeProvider>,
  );
  return { tree, onClose };
}

const SLIDE_START = [
  "October 2026 Broke Report.",
  "In October you spent",
  "Where it went",
];

function slideNumber(tree: TestTree): string {
  return summaryLabel(tree);
}

describe("StoryPlayer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("starts on the cover with an accessible summary", async () => {
    const { tree } = await renderPlayer();
    expect(slideNumber(tree)).toContain(SLIDE_START[0]);
    expect(textsOf(tree)).toContain("October");
    unmountTree(tree);
  });

  it("moves with the accessible Next and Previous buttons, in the snapshot's order", async () => {
    const { tree } = await renderPlayer();
    press(tree, "Next slide");
    expect(slideNumber(tree)).toContain("18,620");
    press(tree, "Next slide");
    expect(slideNumber(tree)).toContain("1. Food & Dining, 40%");
    press(tree, "Previous slide");
    expect(slideNumber(tree)).toContain("18,620");
    unmountTree(tree);
  });

  it("does not wrap: Next on the last slide stays, Previous on the first restarts it", async () => {
    const { tree } = await renderPlayer();
    for (let i = 0; i < 20; i += 1) {
      press(tree, "Next slide");
    }
    // The closing slide, with its controls.
    expect(pressables(tree, "Share your Broke Report")).not.toHaveLength(0);
    expect(slideNumber(tree)).toContain("The Thousand Cuts Club");

    const first = await renderPlayer();
    press(first.tree, "Previous slide");
    expect(slideNumber(first.tree)).toContain(SLIDE_START[0]);
    unmountTree(first.tree);
    unmountTree(tree);
  });

  it("plays only the slides the snapshot lists", async () => {
    const { tree } = await renderPlayer(MINIMAL_SNAPSHOT);
    const seen: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      seen.push(slideNumber(tree));
      press(tree, "Next slide");
    }
    // cover, damage, lineup, closing, then it stays on closing.
    expect(seen).toHaveLength(6);
    expect(seen[0]).toContain("Broke Report.");
    expect(seen[3]).toBe(seen[5]);
    expect(new Set(seen).size).toBe(4);
    unmountTree(tree);
  });

  it("always has a Close button", async () => {
    const { tree, onClose } = await renderPlayer();
    press(tree, "Close report");
    expect(onClose).toHaveBeenCalledTimes(1);
    unmountTree(tree);
  });

  it("shows a progress segment per slide", async () => {
    const { tree } = await renderPlayer();
    // Segments are the only pressables without a label.
    const segments = tree.root.findAll(
      (node) =>
        typeof node.props.onPress === "function" &&
        node.props.accessibilityLabel === undefined &&
        node.props.hitSlop !== undefined,
    );
    expect(segments.length).toBeGreaterThanOrEqual(8);
    unmountTree(tree);
  });

  it("on the closing slide: Done closes, Share captures, a failed capture shows a toast", async () => {
    const { tree, onClose } = await renderPlayer(MINIMAL_SNAPSHOT);
    for (let i = 0; i < 5; i += 1) {
      press(tree, "Next slide");
    }
    expect(pressables(tree, "Show amounts on the shared card")).not.toHaveLength(0);

    share.mockResolvedValueOnce("capture_failed");
    await pressAsync(tree, "Share your Broke Report");
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ periodKey: "2026-08", message: expect.stringContaining("August") }),
    );
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "error" }),
    );

    mockToast.mockClear();
    share.mockResolvedValueOnce("shared");
    await pressAsync(tree, "Share your Broke Report");
    expect(mockToast).not.toHaveBeenCalled();

    press(tree, "Done, close the report");
    expect(onClose).toHaveBeenCalledTimes(1);
    unmountTree(tree);
  });

  it("keeps amounts off the shared card until the switch is turned on", async () => {
    const { tree } = await renderPlayer(FULL_SNAPSHOT);
    for (let i = 0; i < 20; i += 1) {
      press(tree, "Next slide");
    }
    // The card is mounted under the slide: no rupee value on it by default.
    const cardTexts = () => textsOf(tree);
    expect(cardTexts()).toContain("busiest weekday");
    press(tree, "Show amounts on the shared card");
    expect(cardTexts()).not.toContain("busiest weekday");
    unmountTree(tree);
  });

  it("plays a fallback story, with a way out, when the snapshot lists nothing playable", async () => {
    for (const slides of [["hologram"], [] as string[]]) {
      const { tree, onClose } = await renderPlayer({ ...FULL_SNAPSHOT, slides });
      expect(tree.toJSON()).not.toBeNull();
      expect(slideNumber(tree)).toContain("Broke Report.");
      press(tree, "Close report");
      expect(onClose).toHaveBeenCalledTimes(1);
      const seen = new Set<string>();
      for (let i = 0; i < 6; i += 1) {
        seen.add(slideNumber(tree));
        press(tree, "Next slide");
      }
      // cover, damage, closing
      expect(seen.size).toBe(3);
      expect(pressables(tree, "Share your Broke Report")).not.toHaveLength(0);
      unmountTree(tree);
    }
  });

  it("starts a fresh story when another report replaces the one on screen", async () => {
    const onClose = jest.fn();
    const october = FULL_SNAPSHOT;
    const september: ReportSnapshot = {
      ...FULL_SNAPSHOT,
      period_key: "2026-09",
      month: 9,
    };
    const element = (snapshot: ReportSnapshot) => (
      <ThemeProvider>
        <StoryPlayer snapshot={snapshot} level="spicy" onClose={onClose} />
      </ThemeProvider>
    );
    const tree = await renderTree(element(october));

    // Deep into the October story, amounts turned on.
    for (let i = 0; i < 20; i += 1) {
      press(tree, "Next slide");
    }
    press(tree, "Show amounts on the shared card");
    expect(textsOf(tree)).not.toContain("busiest weekday");

    // A link opens September while this is on screen.
    updateTree(tree, element(september));
    expect(slideNumber(tree)).toContain("September 2026 Broke Report.");
    expect(textsOf(tree)).toContain("September");

    // Back on the closing slide: the switch is off again and the card is the private one.
    for (let i = 0; i < 20; i += 1) {
      press(tree, "Next slide");
    }
    expect(textsOf(tree)).toContain("busiest weekday");

    // A report with fewer slides resets the progress bar and the index too.
    updateTree(tree, element(MINIMAL_SNAPSHOT));
    expect(slideNumber(tree)).toContain("August 2026 Broke Report.");
    unmountTree(tree);
  });

  it("does not put a payee name on the shared card unless amounts are turned on", async () => {
    // Find a month whose on-screen tagline names the payee.
    const loyalist = (period_key: string): ReportSnapshot => ({
      ...FULL_SNAPSHOT,
      period_key,
      title: { id: "loyalist", evidence: { visits: 9 } },
    });
    const keys = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
    const key = keys.find((candidate) =>
      resolveReportCopy(loyalist(candidate), "spicy").title.tagline.includes("Corner Cafe"),
    );
    expect(key).toBeDefined();

    const { tree } = await renderPlayer(loyalist(key as string));
    for (let i = 0; i < 20; i += 1) {
      press(tree, "Next slide");
    }
    // The closing slide shows the real tagline; the card (the second place it appears) must not.
    const taglines = textsOf(tree).filter((text) => text.includes("Corner Cafe"));
    expect(taglines).toHaveLength(1);
    press(tree, "Show amounts on the shared card");
    expect(textsOf(tree).filter((text) => text.includes("Corner Cafe"))).toHaveLength(2);
    unmountTree(tree);
  });
});
