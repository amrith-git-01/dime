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
  it("with a budget: eyebrow, spent amount, one bar's legend and the left-of meta line", async () => {
    const tree = await renderTree(
      wrap(
        <HeroMonthCard
          monthLabel="Nov 2026"
          heroAmount={money(9509)}
          hasBudget
          subtext={`${money(48491)} left of ${money(58000)}`}
          progress={0.16}
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
    expect(texts.join("")).toContain(`${money(48491)} left of ${money(58000)}`);
    expect(texts.join("")).toContain("· 16% used");
    expect(texts).not.toContain("View");
    unmountTree(tree);
  });

  it("without a budget it keeps the 'Set a budget' link", async () => {
    const onAddBudget = jest.fn();
    const tree = await renderTree(
      wrap(
        <HeroMonthCard
          monthLabel="Nov 2026"
          heroAmount={money(9509)}
          hasBudget={false}
          subtext=""
          progress={0}
          fixedSpent={350}
          flexibleSpent={9159}
          onAddBudget={onAddBudget}
        />,
      ),
    );
    expect(textsOf(tree)).toContain("Set a budget ›");
    unmountTree(tree);
  });
});
