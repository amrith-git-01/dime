import { CategoriesAheadCard } from "../CategoriesAheadCard";
import { ComingUpCard, COMING_UP_COLLAPSED_ROWS } from "../ComingUpCard";
import { ForecastHeroCard } from "../ForecastHeroCard";
import { SafeToSpendCard } from "../SafeToSpendCard";
import { WatchCard } from "../WatchCard";
import {
  act,
  hasPressable,
  joinedText,
  makeActions,
  makeForecast,
  press,
  render,
} from "./forecastTestKit";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));

const RS = "₹ ";

describe("ForecastHeroCard", () => {
  it("shows where the month lands, the range as text, the chance and last month's accuracy", () => {
    const text = joinedText(render(<ForecastHeroCard forecast={makeForecast()} />));
    expect(text).toContain("This month will likely land at");
    expect(text).toContain(`${RS}28,900`);
    expect(text).toContain(`Range ${RS}27,100 – ${RS}31,200`);
    expect(text).toContain(`Budget ${RS}30,000`);
    expect(text).toContain(`71% chance you stay under ${RS}30,000`);
    expect(text).toContain("On track: likely");
    expect(text).toContain("Last month's forecast was within 6%");
    expect(text).not.toContain("Learning");
    expect(text).not.toContain("wider");
  });

  it("reads as one sentence to a screen reader, range included", () => {
    const tree = render(<ForecastHeroCard forecast={makeForecast()} />);
    const labelled = tree.root.findAll(
      (node) => typeof node.props.accessibilityLabel === "string" && node.props.accessible === true,
    );
    const label = labelled[0]?.props.accessibilityLabel as string;
    expect(label).toContain("Likely between");
    expect(label).toContain("71% chance");
  });

  it("is honest about still learning", () => {
    const text = joinedText(
      render(<ForecastHeroCard forecast={makeForecast({ mode: "learning", historyDays: 9, accuracy: null })} />),
    );
    expect(text).toContain("At this pace the month may end near");
    expect(text).toContain("Learning your patterns — 9 of 30 days");
    expect(text).not.toContain("Last month's forecast");
  });

  it("explains wider ranges while warming up", () => {
    const text = joinedText(
      render(<ForecastHeroCard forecast={makeForecast({ mode: "warming", historyDays: 20 })} />),
    );
    expect(text).toContain("Ranges are wider while Dime learns your patterns — 20 of 30 days");
  });

  it("asks for a few days of data when there is nothing to forecast yet", () => {
    const base = makeForecast({ mode: "learning", historyDays: 0, accuracy: null, summary: "" });
    const text = joinedText(
      render(
        <ForecastHeroCard
          forecast={{
            ...base,
            landing: { ...base.landing, p10: "0.00", p50: "0.00", p90: "0.00", spentSoFar: "0.00" },
          }}
        />,
      ),
    );
    expect(text).toContain("Add a few days of spending");
    expect(text).toContain("Learning your patterns — 0 of 30 days");
    expect(text).not.toContain("Range");
  });

  it("drops the budget and the chance without a budget", () => {
    const base = makeForecast();
    const text = joinedText(
      render(
        <ForecastHeroCard
          forecast={{ ...base, landing: { ...base.landing, budget: null, chanceUnder: null } }}
        />,
      ),
    );
    expect(text).toContain("Set a monthly budget to see your chance of staying under it.");
    expect(text).not.toContain("chance you stay");
    expect(text).not.toContain("Budget");
    expect(text).toContain(`${RS}28,900`);
  });
});

describe("SafeToSpendCard", () => {
  it("shows what is safe to spend today with the weekday note", () => {
    const text = joinedText(render(<SafeToSpendCard safeToday={makeForecast().safeToday!} />));
    expect(text).toContain("SAFE TO SPEND TODAY");
    expect(text).toContain(`${RS}840`);
    expect(text).toContain(`Thursdays usually run about ${RS}520`);
  });

  it("falls back to the usual weekday spend without a budget", () => {
    const text = joinedText(
      render(<SafeToSpendCard safeToday={{ amount: null, usualForWeekday: "520.00", weekday: "Thu" }} />),
    );
    expect(text).toContain(`Usual for a Thursday: ${RS}520`);
    expect(text).not.toContain("usually run");
  });

  it("says so when the budget is used up", () => {
    const text = joinedText(
      render(<SafeToSpendCard safeToday={{ amount: "0.00", usualForWeekday: "520.00", weekday: "Thu" }} />),
    );
    expect(text).toContain("The budget is used up");
  });
});

describe("ComingUpCard", () => {
  it("groups by day and marks bills, likely spends and income", () => {
    const forecast = makeForecast();
    const text = joinedText(
      render(<ComingUpCard upcoming={forecast.upcoming} today={forecast.today} actions={makeActions()} />),
    );
    const order = ["Tomorrow", "Netflix", "Swiggy", "Sat, 24 Oct", "Sun, 1 Nov"].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(text).toContain(`~${RS}350`);
    expect(text).toContain(`+${RS}52,000`);
    expect(text.indexOf("Swiggy")).toBeLessThan(text.indexOf("Netflix"));
  });

  it("opens the answers on a likely spend and reports them", () => {
    const forecast = makeForecast();
    const actions = makeActions();
    const tree = render(
      <ComingUpCard upcoming={forecast.upcoming} today={forecast.today} actions={actions} />,
    );
    expect(hasPressable(tree, "Yes, usual")).toBe(false);

    const rowLabel = (label: string) => label.startsWith("Swiggy, likely");
    const row = tree.root.findAll(
      (node) => rowLabel(String(node.props.accessibilityLabel)) && typeof node.props.onPress === "function",
    )[0];
    expect(row).toBeDefined();
    act(() => (row!.props.onPress as () => void)());

    press(tree, "Yes, usual");
    expect(actions.onConfirmLikely).toHaveBeenCalledWith(forecast.upcoming[1]);
    // The answers fold away once one is given.
    expect(hasPressable(tree, "Not expected")).toBe(false);

    act(() => (row!.props.onPress as () => void)());
    press(tree, "Not expected");
    expect(actions.onDismissLikely).toHaveBeenCalledWith(forecast.upcoming[1]);
  });

  it("lets a screen reader answer without opening the row", () => {
    const forecast = makeForecast();
    const actions = makeActions();
    const tree = render(
      <ComingUpCard upcoming={forecast.upcoming} today={forecast.today} actions={actions} />,
    );
    const row = tree.root.findAll(
      (node) => Array.isArray(node.props.accessibilityActions) && typeof node.props.onAccessibilityAction === "function",
    )[0];
    act(() =>
      (row!.props.onAccessibilityAction as (e: { nativeEvent: { actionName: string } }) => void)({
        nativeEvent: { actionName: "dismiss" },
      }),
    );
    expect(actions.onDismissLikely).toHaveBeenCalledTimes(1);
  });

  it("says when nothing is coming", () => {
    const text = joinedText(render(<ComingUpCard upcoming={[]} today="2026-10-22" actions={makeActions()} />));
    expect(text).toContain("Nothing expected in the next 14 days.");
  });

  it("folds a long list behind Show more", () => {
    const upcoming = Array.from({ length: COMING_UP_COLLAPSED_ROWS + 3 }, (_, n) => ({
      id: `u${n}`,
      kind: "bill" as const,
      name: `Bill ${n}`,
      amount: "100.00",
      date: "2026-10-24",
    }));
    const tree = render(<ComingUpCard upcoming={upcoming} today="2026-10-22" actions={makeActions()} />);
    expect(joinedText(tree)).not.toContain(`Bill ${COMING_UP_COLLAPSED_ROWS}`);
    press(tree, "Show 3 more");
    expect(joinedText(tree)).toContain(`Bill ${COMING_UP_COLLAPSED_ROWS + 2}`);
  });
});

describe("WatchCard", () => {
  const renderWatch = () => {
    const actions = makeActions();
    const forecast = makeForecast();
    const tree = render(<WatchCard watch={forecast.watch} actions={actions} />);
    return { tree, actions, watch: forecast.watch };
  };

  it("offers the right answers for each kind", () => {
    const { tree } = renderWatch();
    for (const label of [
      "See transactions",
      "Dismiss",
      "It's a one-off",
      "Not unusual",
      "Track as recurring",
      "Not a subscription",
    ]) {
      expect(hasPressable(tree, label)).toBe(true);
    }
  });

  it("sends a hot category to its transactions or hides it", () => {
    const { tree, actions, watch } = renderWatch();
    press(tree, "See transactions");
    expect(actions.onSeeCategoryTransactions).toHaveBeenCalledWith(watch[0]);
    press(tree, "Dismiss");
    expect(actions.onDismissCategoryWatch).toHaveBeenCalledWith(watch[0]);
  });

  it("opens an unusual payment or marks it one-off or not unusual", () => {
    const { tree, actions, watch } = renderWatch();
    press(tree, "It's a one-off");
    expect(actions.onMarkOneOff).toHaveBeenCalledWith(watch[1]);
    press(tree, "Not unusual");
    expect(actions.onMarkNotUnusual).toHaveBeenCalledWith(watch[1]);
    const row = tree.root.findAll(
      (node) => node.props.accessibilityHint === "Opens the payment" && typeof node.props.onPress === "function",
    )[0];
    act(() => (row!.props.onPress as () => void)());
    expect(actions.onOpenUnusual).toHaveBeenCalledWith(watch[1]);
  });

  it("tracks a subscription candidate as recurring or says it is not one", () => {
    const { tree, actions, watch } = renderWatch();
    press(tree, "Track as recurring");
    expect(actions.onTrackRecurring).toHaveBeenCalledWith(watch[2]);
    press(tree, "Not a subscription");
    expect(actions.onDismissSubscription).toHaveBeenCalledWith(watch[2]);
  });
});

describe("CategoriesAheadCard", () => {
  it("lists categories needing attention first, with the status in words", () => {
    const onPress = jest.fn();
    const tree = render(<CategoriesAheadCard categories={makeForecast().categories} onCategoryPress={onPress} />);
    const text = joinedText(tree);
    expect(text.indexOf("Shopping")).toBeLessThan(text.indexOf("Food"));
    expect(text.indexOf("Food")).toBeLessThan(text.indexOf("Uncategorized"));
    expect(text).toContain("Over budget");
    expect(text).toContain("Running hot");
    expect(text).toContain("On track");
    expect(text).toContain(`of ${RS}8,000 budget`);
    expect(text).toContain("no budget set");
  });

  it("measures against the usual spend when there is no budget", () => {
    const category = { ...makeForecast().categories[0]!, budget: null, status: "over" as const };
    const text = joinedText(render(<CategoriesAheadCard categories={[category]} onCategoryPress={jest.fn()} />));
    expect(text).toContain(`usual ${RS}6,200`);
    expect(text).toContain("Over usual");
  });

  it("opens a category on press, but not the uncategorized row", () => {
    const onPress = jest.fn();
    const categories = makeForecast().categories;
    const tree = render(<CategoriesAheadCard categories={categories} onCategoryPress={onPress} />);
    const pressable = (name: string) =>
      tree.root.findAll(
        (node) =>
          String(node.props.accessibilityLabel).startsWith(name) && typeof node.props.onPress === "function",
      );
    expect(pressable("Uncategorized")).toHaveLength(0);
    act(() => (pressable("Food")[0]!.props.onPress as () => void)());
    expect(onPress).toHaveBeenCalledWith(categories[0]);
  });
});
