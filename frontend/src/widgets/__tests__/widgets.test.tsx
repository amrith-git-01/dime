import { format } from "date-fns";
import type { WidgetRepresentation } from "react-native-android-widget";

import { deepLinkUrls } from "@/lib/deepLinks/deepLinkUrls";
import { setHideWidgetAmounts } from "@/lib/widgets/widgetPreferences";
import {
  writeWidgetLastAction,
  writeWidgetOutbox,
  writeWidgetPresets,
} from "@/lib/widgets/widgetPresetsMmkv";
import { writeWidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";
import { darkColors, lightColors } from "@/theme/palettes";
import { setThemePreference } from "@/theme/themePreference";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { CategoryBudgetsWidget } from "../CategoryBudgetsWidget";
import { buildCategoryBudgetsModel } from "../categoryBudgetsModel";
import { QuickAddWidget } from "../QuickAddWidget";
import { buildQuickAddModel } from "../quickAddModel";
import { renderKnownWidget, renderWidget } from "../renderWidget";
import { ThisMonthWidget } from "../ThisMonthWidget";
import { buildThisMonthModel } from "../thisMonthModel";
import { TodayWidget } from "../TodayWidget";
import { buildTodayModel } from "../todayModel";
import { UpcomingWidget } from "../UpcomingWidget";
import { buildUpcomingModel } from "../upcomingModel";
import { WIDGET_NAMES } from "../widgetNames";
import {
  flattenWidgetTree,
  widgetClickUris,
  widgetStyles,
  widgetTexts,
} from "./widgetTree";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("react-native-android-widget", () => {
  const primitive = (name: string) => Object.assign(() => null, { __name__: name });
  return {
    FlexWidget: primitive("LinearLayoutWidget"),
    TextWidget: primitive("TextWidget"),
    requestWidgetUpdate: jest.fn(),
  };
});

/** The light variant of a themed widget, or the widget itself when only one was rendered. */
function lightOf(widget: WidgetRepresentation) {
  return "light" in widget ? widget.light : widget;
}

const NOW = new Date();
const MONTH_KEY = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, "0")}`;
const TODAY_KEY = format(NOW, "yyyy-MM-dd");

const SNAPSHOT_FULL = {
  userId: "user-a",
  updatedAt: NOW.getTime(),
  monthKey: MONTH_KEY,
  dayKey: TODAY_KEY,
  spentThisMonth: 6177,
  recurringSpent: 2000,
  flexibleSpent: 4177,
  monthlyBudget: 30000,
  budgetLeft: 23823,
  spentToday: 270,
  recentTransactions: [
    { id: "t1", name: "Chai", amount: 20, type: "debit" as const, at: NOW.toISOString() },
    { id: "t2", name: "Swiggy", amount: 250, type: "debit" as const, at: NOW.toISOString() },
  ],
  topCategories: [
    { id: "food", name: "Food", color: "#112233", iconName: null, spent: 1535, budget: 5000 },
    { id: "fuel", name: "Fuel", color: null, iconName: null, spent: 800, budget: null },
  ],
  recurring: [
    {
      id: "r1",
      kind: "subscription" as const,
      name: "Netflix",
      amount: 649,
      nextDueDate: TODAY_KEY,
    },
  ],
};

function writeSnapshot(overrides: Record<string, unknown> = {}): void {
  writeWidgetSnapshot({ ...SNAPSHOT_FULL, ...overrides });
}

describe("ThisMonthWidget", () => {
  beforeEach(resetMockMmkv);

  const model = buildThisMonthModel({ ...SNAPSHOT_FULL, version: 2 }, NOW);

  it("shows the amount, budget line and split, and opens Home when tapped", () => {
    const tree = ThisMonthWidget({ model, colors: lightColors, layout: "full", showSplit: true });
    const texts = widgetTexts(tree);
    expect(texts).toContain(model.amount);
    expect(texts).toContain(model.budgetLine);
    expect(texts).toContain(model.splitLine);
    expect(widgetClickUris(tree)).toEqual([deepLinkUrls.home]);
    expect(tree.props.accessibilityLabel).toBe(model.accessibilityLabel);
  });

  it("hides the split line when the widget is too short for it", () => {
    const tree = ThisMonthWidget({ model, colors: lightColors, layout: "full", showSplit: false });
    expect(widgetTexts(tree)).not.toContain(model.splitLine);
  });

  it("lets the split line wrap to two lines instead of cutting it off", () => {
    const tree = ThisMonthWidget({ model, colors: lightColors, layout: "full", showSplit: true });
    const split = flattenWidgetTree(tree).find((element) => element.props.text === model.splitLine);
    expect(split?.props.maxLines).toBe(2);
  });

  it("draws the budget bar as weighted segments that sum to 100", () => {
    const tree = ThisMonthWidget({ model, colors: lightColors, layout: "full", showSplit: true });
    const weights = widgetStyles(tree)
      .map((style) => style.flex)
      .filter((flex): flex is number => typeof flex === "number");
    expect(weights).toEqual([model.progressPercent, 100 - model.progressPercent!]);
  });

  it("uses the palette it is given", () => {
    const light = widgetStyles(
      ThisMonthWidget({ model, colors: lightColors, layout: "full", showSplit: true }),
    )[0]!;
    const dark = widgetStyles(
      ThisMonthWidget({ model, colors: darkColors, layout: "full", showSplit: true }),
    )[0]!;
    expect(light.backgroundColor).toBe(lightColors.surface);
    expect(dark.backgroundColor).toBe(darkColors.surface);
  });

  it("has a compact 4x1 layout that still shows the amount and opens Home", () => {
    const tree = ThisMonthWidget({ model, colors: lightColors, layout: "compact", showSplit: false });
    expect(widgetTexts(tree)).toEqual(
      expect.arrayContaining([model.title, model.amount, model.budgetLine]),
    );
    expect(widgetClickUris(tree)).toEqual([deepLinkUrls.home]);
  });

  it("shows the sign-in prompt without a snapshot", () => {
    const tree = ThisMonthWidget({
      model: buildThisMonthModel(null, NOW),
      colors: lightColors,
      layout: "full",
      showSplit: true,
    });
    expect(widgetTexts(tree)).toContain("Sign in to Dime");
    expect(widgetClickUris(tree)).toEqual([deepLinkUrls.home]);
  });
});

const QUICK_BASE = {
  signedOut: false,
  presets: [],
  lastAction: null,
  outboxCount: 0,
  heightDp: 70,
  now: NOW.getTime(),
} as const;

describe("QuickAddWidget", () => {
  it("has Add, Scan and Voice buttons that open their deep links (4x1)", () => {
    const tree = QuickAddWidget({
      colors: lightColors,
      model: buildQuickAddModel(QUICK_BASE),
    });
    expect(widgetTexts(tree)).toEqual(["+ Add", "Scan", "Voice"]);
    expect(widgetClickUris(tree)).toEqual([
      deepLinkUrls.addToday,
      deepLinkUrls.scan,
      deepLinkUrls.voice,
    ]);
    expect(tree.props.accessibilityLabel).toBe("Dime quick add");
  });

  it("labels every button for screen readers", () => {
    const labels = flattenWidgetTree(
      QuickAddWidget({ colors: lightColors, model: buildQuickAddModel(QUICK_BASE) }),
    )
      .filter((element) => element.props.clickAction === "OPEN_URI")
      .map((element) => element.props.accessibilityLabel);
    expect(labels).toEqual(["Add a transaction", "Scan a receipt", "Add by voice"]);
  });

  it("4x2 adds one-tap preset buttons that send their index to the task handler", () => {
    const model = buildQuickAddModel({
      ...QUICK_BASE,
      heightDp: 150,
      presets: [
        { label: "Chai", amount: 20, categoryId: "c1" },
        { label: "Auto", amount: 50, categoryId: "c2" },
      ],
    });
    const tree = QuickAddWidget({ colors: lightColors, model });
    expect(widgetTexts(tree)).toEqual(
      expect.arrayContaining(["Chai ₹ 20", "Auto ₹ 50"]),
    );
    const presetTaps = flattenWidgetTree(tree).filter(
      (element) => element.props.clickAction === "PRESET",
    );
    expect(presetTaps.map((element) => element.props.clickActionData)).toEqual([
      { index: 0 },
      { index: 1 },
    ]);
  });

  it("4x2 top-aligns its content and lets the button and preset rows share the height", () => {
    const tree = QuickAddWidget({
      colors: lightColors,
      model: buildQuickAddModel({
        ...QUICK_BASE,
        heightDp: 150,
        presets: [{ label: "Chai", amount: 20, categoryId: "c1" }],
      }),
    });
    const styles = widgetStyles(tree);
    expect(styles[0]).toMatchObject({ flexDirection: "column", justifyContent: "flex-start" });
    expect(styles.filter((style) => style.flex === 1 && style.height === 0)).toHaveLength(2);
  });

  it("4x2 without presets offers a Set up presets button to the widgets settings", () => {
    const tree = QuickAddWidget({
      colors: lightColors,
      model: buildQuickAddModel({ ...QUICK_BASE, heightDp: 150 }),
    });
    expect(widgetTexts(tree)).toContain("Set up presets");
    expect(widgetClickUris(tree)).toContain(deepLinkUrls.settingsWidgets);
  });

  it("4x2 shows the last action with an Undo control", () => {
    const model = buildQuickAddModel({
      ...QUICK_BASE,
      heightDp: 150,
      presets: [{ label: "Chai", amount: 20, categoryId: "c1" }],
      lastAction: {
        kind: "added",
        userId: "user-a",
        id: "tx-1",
        key: "k",
        label: "Chai",
        amount: 20,
        at: NOW.getTime(),
        createdAt: NOW.getTime(),
      },
    });
    const tree = QuickAddWidget({ colors: lightColors, model });
    expect(widgetTexts(tree)).toEqual(
      expect.arrayContaining(["Added ₹ 20 · Chai", "Undo"]),
    );
    expect(
      flattenWidgetTree(tree).some((element) => element.props.clickAction === "UNDO"),
    ).toBe(true);
  });

  it("4x1 never shows presets or a status line", () => {
    const model = buildQuickAddModel({
      ...QUICK_BASE,
      presets: [{ label: "Chai", amount: 20, categoryId: "c1" }],
      outboxCount: 1,
    });
    expect(widgetTexts(QuickAddWidget({ colors: lightColors, model }))).toEqual([
      "+ Add",
      "Scan",
      "Voice",
    ]);
  });
});

describe("TodayWidget", () => {
  const model = buildTodayModel({ ...SNAPSHOT_FULL, version: 2 }, NOW);

  it("shows today's total and rows, with a + that opens quick add dated today", () => {
    const tree = TodayWidget({ model, colors: lightColors });
    expect(widgetTexts(tree)).toEqual(
      expect.arrayContaining(["Today", model.amount, "Chai", "Swiggy", "+"]),
    );
    expect(widgetClickUris(tree)).toEqual([deepLinkUrls.home, deepLinkUrls.addToday]);
    expect(tree.props.accessibilityLabel).toBe(model.accessibilityLabel);
  });

  it("signed out: the prompt, no + button, still opens the app", () => {
    const tree = TodayWidget({
      model: buildTodayModel(null, NOW),
      colors: lightColors,
    });
    expect(widgetTexts(tree)).toContain("Sign in to Dime");
    expect(widgetTexts(tree)).not.toContain("+");
    expect(widgetClickUris(tree)).toEqual([deepLinkUrls.home]);
  });
});

describe("UpcomingWidget", () => {
  const snapshot = { ...SNAPSHOT_FULL, version: 2 };

  it("lists the next items and opens Budgets > Recurring", () => {
    const model = buildUpcomingModel(snapshot, NOW);
    const tree = UpcomingWidget({ model, colors: lightColors });
    expect(widgetTexts(tree)).toEqual(
      expect.arrayContaining(["Upcoming", "Netflix", "Today", model.rows[0]!.amount]),
    );
    expect(widgetClickUris(tree)).toEqual([deepLinkUrls.budgetsRecurring]);
    expect(tree.props.accessibilityLabel).toBe(model.accessibilityLabel);
  });

  it("colours income and expenses differently", () => {
    const model = buildUpcomingModel(
      {
        ...snapshot,
        recurring: [
          { id: "i", kind: "income", name: "Salary", amount: 50000, nextDueDate: TODAY_KEY },
          { id: "b", kind: "subscription", name: "Rent", amount: 15000, nextDueDate: TODAY_KEY },
        ],
      },
      NOW,
    );
    const tree = UpcomingWidget({ model, colors: lightColors });
    const colourOf = (text: string) =>
      (
        flattenWidgetTree(tree).find((element) => element.props.text === text)?.props
          .style as { color: string }
      ).color;
    expect(colourOf(model.rows[0]!.amount)).toBe(lightColors.success);
    expect(colourOf(model.rows[1]!.amount)).toBe(lightColors.ink);
  });

  it("shows the empty message", () => {
    const tree = UpcomingWidget({
      model: buildUpcomingModel({ ...snapshot, recurring: [] }, NOW),
      colors: lightColors,
    });
    expect(widgetTexts(tree)).toContain("No recurring due in the next 30 days");
  });
});

describe("CategoryBudgetsWidget", () => {
  const snapshot = { ...SNAPSHOT_FULL, version: 2 };
  const model = buildCategoryBudgetsModel(snapshot, NOW);

  it("draws a dot, name, amounts and a progress bar per category, and opens Budgets", () => {
    const tree = CategoryBudgetsWidget({ model, colors: lightColors });
    expect(widgetTexts(tree)).toEqual(
      expect.arrayContaining(["Top categories", "Food", "Fuel", model.rows[0]!.amountText]),
    );
    expect(widgetClickUris(tree)).toEqual([deepLinkUrls.budgets]);
    const styles = widgetStyles(tree);
    // The first row's dot carries the category colour (no icons: there is no SVG mapping).
    expect(styles.some((style) => style.backgroundColor === "#112233")).toBe(true);
    // A row without a colour falls back to the accent.
    expect(styles.some((style) => style.backgroundColor === lightColors.accent)).toBe(true);
    const weights = styles
      .map((style) => style.flex)
      .filter((flex): flex is number => typeof flex === "number" && flex > 1);
    expect(weights).toEqual(expect.arrayContaining([31, 69]));
  });

  it("uses the danger colour for a category over its cap", () => {
    const over = buildCategoryBudgetsModel(
      {
        ...snapshot,
        topCategories: [
          { id: "fun", name: "Fun", color: "#112233", iconName: null, spent: 600, budget: 500 },
        ],
      },
      NOW,
    );
    const styles = widgetStyles(CategoryBudgetsWidget({ model: over, colors: lightColors }));
    expect(styles.some((style) => style.backgroundColor === lightColors.danger)).toBe(true);
  });

  it("signed out: the prompt that opens the app", () => {
    const tree = CategoryBudgetsWidget({
      model: buildCategoryBudgetsModel(null, NOW),
      colors: lightColors,
    });
    expect(widgetTexts(tree)).toContain("Sign in to Dime");
    expect(widgetClickUris(tree)).toEqual([deepLinkUrls.home]);
  });
});

describe("renderKnownWidget", () => {
  beforeEach(resetMockMmkv);

  it("follows the OS when the app theme is System default", () => {
    writeSnapshot();
    const widget = renderKnownWidget("ThisMonth", 150);
    expect(widget).toHaveProperty("light");
    expect(widget).toHaveProperty("dark");
  });

  it("renders a single variant when the app theme is forced", () => {
    writeSnapshot();
    setThemePreference("dark");
    const widget = renderKnownWidget("QuickAdd", 70);
    expect(widget).not.toHaveProperty("light");
    expect(widgetStyles(lightOf(widget))[0]!.backgroundColor).toBe(darkColors.surface);

    setThemePreference("light");
    const light = renderKnownWidget("QuickAdd", 70);
    expect(widgetStyles(lightOf(light))[0]!.backgroundColor).toBe(lightColors.surface);
  });

  it("draws This month from the stored snapshot, and the sign-in prompt when there is none", () => {
    writeSnapshot();
    const withData = renderKnownWidget("ThisMonth", 150);
    expect(widgetTexts(lightOf(withData))).toContain("₹ 6,177");

    resetMockMmkv();
    const signedOut = renderKnownWidget("ThisMonth", 150);
    expect(widgetTexts(lightOf(signedOut))).toContain("Sign in to Dime");
  });

  it("picks the compact layout for a short widget", () => {
    writeSnapshot();
    const compact = renderKnownWidget("ThisMonth", 70);
    const full = renderKnownWidget("ThisMonth", 150);
    expect(widgetStyles(lightOf(compact))[0]!.flexDirection).toBe("row");
    expect(widgetStyles(lightOf(full))[0]!.flexDirection).toBe("column");
  });

  it("draws the other three widgets from the stored snapshot", () => {
    writeSnapshot();
    expect(widgetTexts(lightOf(renderKnownWidget("Today", 150)))).toContain("Chai");
    expect(widgetTexts(lightOf(renderKnownWidget("Upcoming", 150)))).toContain("Netflix");
    expect(widgetTexts(lightOf(renderKnownWidget("CategoryBudgets", 150)))).toContain("Food");
  });

  it("every widget has a root accessibility label", () => {
    writeSnapshot();
    for (const name of WIDGET_NAMES) {
      const root = flattenWidgetTree(lightOf(renderKnownWidget(name, 150)))[0]!;
      expect(root.props.accessibilityLabel).toEqual(expect.stringContaining("Dime"));
    }
  });

  it("every widget shows the sign-in prompt without a snapshot", () => {
    for (const name of WIDGET_NAMES) {
      const texts = widgetTexts(lightOf(renderKnownWidget(name, 150)));
      expect(texts).toContain("Sign in to Dime");
    }
  });

  it("hides amounts on every widget when the preference is on", () => {
    writeSnapshot();
    writeWidgetPresets("user-a", [{ label: "Chai", amount: 20, categoryId: "c1" }]);
    setHideWidgetAmounts(true);
    for (const name of WIDGET_NAMES) {
      const texts = widgetTexts(lightOf(renderKnownWidget(name, 150))).join(" | ");
      expect(texts).toContain("₹ ••••");
      expect(texts).not.toMatch(/\d,\d{3}|₹ \d/);
    }
  });

  it("QuickAdd reads presets, the queue and the last action from storage", () => {
    writeSnapshot();
    writeWidgetPresets("user-a", [{ label: "Chai", amount: 20, categoryId: "c1" }]);
    expect(widgetTexts(lightOf(renderKnownWidget("QuickAdd", 150)))).toContain("Chai ₹ 20");

    writeWidgetOutbox([
      {
        key: "k",
        userId: "user-a",
        body: {} as never,
        label: "Chai",
        amount: 20,
        createdAt: Date.now(),
      },
    ]);
    expect(widgetTexts(lightOf(renderKnownWidget("QuickAdd", 150)))).toContain(
      "Queued · adds when online",
    );

    writeWidgetLastAction({
      kind: "signedOut",
      userId: "user-a",
      label: "",
      amount: 0,
      at: Date.now(),
      createdAt: Date.now(),
    });
    expect(widgetTexts(lightOf(renderKnownWidget("QuickAdd", 150)))).toContain("Sign in to Dime");
  });

  it("QuickAdd ignores a last action that belongs to another account", () => {
    writeSnapshot();
    writeWidgetLastAction({
      kind: "added",
      userId: "someone-else",
      id: "tx-1",
      label: "Chai",
      amount: 20,
      at: Date.now(),
      createdAt: Date.now(),
    });
    const texts = widgetTexts(lightOf(renderKnownWidget("QuickAdd", 150)));
    expect(texts.some((text) => text.startsWith("Added"))).toBe(false);
    expect(texts).not.toContain("Undo");
  });

  it("ignores widgets this build does not know", () => {
    expect(
      renderWidget({
        widgetName: "Nope",
        widgetId: 1,
        height: 100,
        width: 100,
        screenInfo: { screenHeightDp: 0, screenWidthDp: 0, density: 1, densityDpi: 160 },
      }),
    ).toBeNull();
  });
});
