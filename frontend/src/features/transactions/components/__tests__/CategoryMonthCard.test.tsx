import {
  press,
  pressables,
  renderTree,
  textsOf,
  unmountTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { formatInrCompact } from "@/utils/currency";

import type { CategoryMonthView } from "../../utils/categoryMonthStats";
import { CategoryMonthCard, type CategoryMonthCardProps } from "../CategoryMonthCard";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  LinearTransition: {
    springify: () => ({ damping: () => ({ stiffness: () => ({ mass: () => ({}) }) }) }),
  },
}));

const money = formatInrCompact;

function view(over: Partial<CategoryMonthView> = {}): CategoryMonthView {
  return {
    hero: money(5958),
    over: false,
    cap: {
      state: "ready",
      progress: 0.5958,
      tone: "accent",
      metaLine: `${money(4042)} left of ${money(10000)} · 60%`,
    },
    offerSetCap: false,
    paceLine: `${money(183)}/day for the next 22 days`,
    stats: {
      primary: { label: "Today", value: money(0) },
      payments: { label: "Payments", value: "7" },
      compare: {
        label: "vs Oct",
        value: `▲ ${money(1210)}`,
        tone: "danger",
        accessibilityLabel: `${money(1210)} more than by 8 October`,
      },
    },
    ...over,
  };
}

function props(over: Partial<CategoryMonthCardProps> = {}): CategoryMonthCardProps {
  return {
    categoryName: "Shopping",
    barKey: "test-bar",
    monthLabel: "November 2026",
    prevMonthLabel: "October 2026",
    canGoPrevMonth: true,
    canGoNextMonth: false,
    onPrevMonth: jest.fn(),
    onNextMonth: jest.fn(),
    view: view(),
    onEdit: jest.fn(),
    onSetCap: jest.fn(),
    ...over,
  };
}

async function render(over: Partial<CategoryMonthCardProps> = {}) {
  const p = props(over);
  const tree = await renderTree(
    <ThemeProvider>
      <CategoryMonthCard {...p} />
    </ThemeProvider>,
  );
  return { tree, props: p, text: textsOf(tree).join("|") };
}

describe("CategoryMonthCard", () => {
  it("shows the month, the spend against its cap, the pace and the three stats", async () => {
    const { tree, text } = await render();
    expect(text).toContain("November 2026");
    expect(text).toContain("SPENT");
    expect(text).toContain(money(5958));
    expect(text).toContain(`${money(4042)} left of ${money(10000)} · 60%`);
    expect(text).toContain(`${money(183)}/day for the next 22 days`);
    expect(text).toContain("Today");
    expect(text).toContain("Payments");
    expect(text).toContain("vs Oct");
    expect(text).toContain(`▲ ${money(1210)}`);
    unmountTree(tree);
  });

  it("describes the comparison for screen readers", async () => {
    const { tree } = await render();
    const labelled = tree.root.findAll(
      (node) => node.props.accessibilityLabel === `${money(1210)} more than by 8 October`,
    );
    expect(labelled.length).toBeGreaterThan(0);
    unmountTree(tree);
  });

  it("marks a spend over the cap and shows the overage", async () => {
    const { tree, text } = await render({
      view: view({
        hero: money(12000),
        over: true,
        cap: {
          state: "ready",
          progress: 1,
          tone: "danger",
          metaLine: `${money(2000)} over ${money(10000)} · 120%`,
        },
        paceLine: null,
      }),
    });
    expect(text).toContain(`${money(2000)} over ${money(10000)} · 120%`);
    expect(text).not.toContain("/day for the next");
    unmountTree(tree);
  });

  it("offers a plain 'Set a monthly cap' link when there is no cap, and it opens the editor", async () => {
    const { tree, props: p, text } = await render({
      view: view({ cap: null, offerSetCap: true, paceLine: null }),
    });
    expect(text).toContain("Set a monthly cap ›");
    expect(text).not.toContain("left of");
    press(tree, "Set a monthly cap");
    expect(p.onSetCap).toHaveBeenCalledTimes(1);
    unmountTree(tree);
  });

  it("has no cap link for a category that cannot have a cap", async () => {
    const { tree, text } = await render({
      view: view({ cap: null, offerSetCap: false, paceLine: null }),
      onEdit: undefined,
      onSetCap: undefined,
    });
    expect(text).not.toContain("Set a monthly cap");
    expect(pressables(tree, "Edit Shopping")).toHaveLength(0);
    unmountTree(tree);
  });

  it("shows Avg/day and no pace line for a past month", async () => {
    const { tree, text } = await render({
      monthLabel: "October 2026",
      canGoNextMonth: true,
      view: view({
        paceLine: null,
        stats: {
          primary: { label: "Avg/day", value: money(192) },
          payments: { label: "Payments", value: "12" },
          compare: {
            label: "vs Sep",
            value: `▼ ${money(800)}`,
            tone: "success",
            accessibilityLabel: `${money(800)} less than September`,
          },
        },
      }),
    });
    expect(text).toContain("Avg/day");
    expect(text).not.toContain("Today");
    expect(text).not.toContain("/day for the next");
    expect(text).toContain(`▼ ${money(800)}`);
    unmountTree(tree);
  });

  it("opens the category editor from the pencil", async () => {
    const { tree, props: p } = await render();
    press(tree, "Edit Shopping");
    expect(p.onEdit).toHaveBeenCalledTimes(1);
    unmountTree(tree);
  });

  it("steps months with the navigator and disables Next on the current month", async () => {
    const { tree, props: p } = await render();
    press(tree, "Previous month, October 2026");
    expect(p.onPrevMonth).toHaveBeenCalledTimes(1);
    const next = pressables(tree, "Next month")[0];
    expect(next.props.disabled).toBe(true);
    unmountTree(tree);
  });

  it("draws skeletons, not numbers, while loading", async () => {
    const { tree, text } = await render({
      view: view({
        hero: null,
        cap: { state: "loading" },
        paceLine: null,
        stats: {
          primary: { label: "Today", value: null },
          payments: { label: "Payments", value: null },
          compare: {
            label: "vs Oct",
            value: null,
            tone: "neutral",
            accessibilityLabel: "vs Oct",
          },
        },
      }),
    });
    expect(text).not.toContain("₹");
    expect(text).toContain("SPENT");
    unmountTree(tree);
  });

  it("shows dashes when the numbers could not be loaded", async () => {
    const { tree, text } = await render({
      view: view({
        hero: "—",
        cap: { state: "ready", progress: 0, tone: "accent", metaLine: "—" },
        paceLine: null,
        stats: {
          primary: { label: "Today", value: "—" },
          payments: { label: "Payments", value: "—" },
          compare: { label: "vs Oct", value: "—", tone: "neutral", accessibilityLabel: "vs Oct" },
        },
      }),
    });
    expect(text.split("|").filter((entry) => entry === "—").length).toBeGreaterThanOrEqual(4);
    unmountTree(tree);
  });
});
