import {
  renderTree,
  textsOf,
  unmountTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { formatInrCompact } from "@/utils/currency";

import { HeroMonthCard } from "../HeroMonthCard";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/hooks/useTourTarget", () => ({ useTourTarget: () => ({}) }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));

const money = formatInrCompact;
const wrap = (element: React.ReactElement) => <ThemeProvider>{element}</ThemeProvider>;

describe("HeroMonthCard", () => {
  it("with a budget: eyebrow, spent amount and one row of columns under the bar, no status line", async () => {
    const tree = await renderTree(
      wrap(
        <HeroMonthCard
          monthLabel="Nov 2026"
          heroAmount={money(9509)}
          hasBudget
          budgetAmount={58000}
          fixedSpent={350}
          flexibleSpent={9159}
          onAddBudget={jest.fn()}
        />,
      ),
    );
    const texts = textsOf(tree);
    expect(texts).toContain("THIS MONTH");
    expect(texts).toContain("Nov 2026");
    expect(texts).toContain(money(9509));
    expect(texts).toContain("spent");
    expect(texts).toContain("Recurring");
    expect(texts).toContain(money(350));
    expect(texts).toContain("Flexible");
    expect(texts).toContain(money(9159));
    expect(texts).toContain(`Left of ${money(58000)}`);
    expect(texts).toContain(money(48491));
    expect(texts.join("")).not.toContain("% used");
    expect(texts.join("")).not.toContain("left of ₹");
    expect(texts).not.toContain("View");
    expect(texts).not.toContain("Set a budget ›");
    unmountTree(tree);
  });

  it("over budget: the third column reads Over by, with the overage", async () => {
    const tree = await renderTree(
      wrap(
        <HeroMonthCard
          monthLabel="Nov 2026"
          heroAmount={money(60000)}
          hasBudget
          budgetAmount={58000}
          fixedSpent={10000}
          flexibleSpent={50000}
          onAddBudget={jest.fn()}
        />,
      ),
    );
    const texts = textsOf(tree);
    expect(texts).toContain("Over by");
    expect(texts).toContain(money(2000));
    expect(texts.join("")).not.toContain("Left of");
    unmountTree(tree);
  });

  it("without a budget it keeps the 'Set a budget' link and shows two columns", async () => {
    const onAddBudget = jest.fn();
    const tree = await renderTree(
      wrap(
        <HeroMonthCard
          monthLabel="Nov 2026"
          heroAmount={money(9509)}
          hasBudget={false}
          fixedSpent={350}
          flexibleSpent={9159}
          onAddBudget={onAddBudget}
        />,
      ),
    );
    const texts = textsOf(tree);
    expect(texts).toContain("Set a budget ›");
    expect(texts).toContain("Recurring");
    expect(texts).toContain("Flexible");
    expect(texts.join("")).not.toContain("Left of");
    expect(texts.join("")).not.toContain("Over by");
    unmountTree(tree);
  });
});
