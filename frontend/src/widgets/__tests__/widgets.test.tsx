import type { WidgetRepresentation } from "react-native-android-widget";

import { deepLinkUrls } from "@/lib/deepLinks/deepLinkUrls";
import { writeWidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";
import { darkColors, lightColors } from "@/theme/palettes";
import { setThemePreference } from "@/theme/themePreference";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { QuickAddWidget } from "../QuickAddWidget";
import { renderKnownWidget, renderWidget } from "../renderWidget";
import { ThisMonthWidget } from "../ThisMonthWidget";
import { buildThisMonthModel } from "../thisMonthModel";
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

function writeSnapshot(overrides: Record<string, unknown> = {}): void {
  writeWidgetSnapshot({
    userId: "user-a",
    updatedAt: NOW.getTime(),
    monthKey: MONTH_KEY,
    dayKey: "2026-10-15",
    spentThisMonth: 6177,
    recurringSpent: 2000,
    flexibleSpent: 4177,
    monthlyBudget: 30000,
    budgetLeft: 23823,
    spentToday: 0,
    recentTransactions: [],
    topCategories: [],
    ...overrides,
  });
}

describe("ThisMonthWidget", () => {
  beforeEach(resetMockMmkv);

  const model = buildThisMonthModel(
    {
      version: 2,
      userId: "user-a",
      updatedAt: 0,
      monthKey: MONTH_KEY,
      dayKey: "",
      spentThisMonth: 6177,
      recurringSpent: 2000,
      flexibleSpent: 4177,
      monthlyBudget: 30000,
      budgetLeft: 23823,
      spentToday: 0,
      recentTransactions: [],
      topCategories: [],
    },
    NOW,
  );

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

describe("QuickAddWidget", () => {
  it("has Add, Scan and Voice buttons that open their deep links", () => {
    const tree = QuickAddWidget({ colors: lightColors });
    expect(widgetTexts(tree)).toEqual(["+ Add", "Scan", "Voice"]);
    expect(widgetClickUris(tree)).toEqual([
      deepLinkUrls.addToday,
      deepLinkUrls.scan,
      deepLinkUrls.voice,
    ]);
    expect(tree.props.accessibilityLabel).toBe("Dime quick add");
  });

  it("labels every button for screen readers", () => {
    const labels = flattenWidgetTree(QuickAddWidget({ colors: lightColors }))
      .filter((element) => element.props.clickAction === "OPEN_URI")
      .map((element) => element.props.accessibilityLabel);
    expect(labels).toEqual(["Add a transaction", "Scan a receipt", "Add by voice"]);
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
