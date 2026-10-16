import { format } from "date-fns";
import type { WidgetInfo, WidgetRepresentation } from "react-native-android-widget";

import { cardLinkUrl, deepLinkUrls } from "@/lib/deepLinks/deepLinkUrls";
import { getWidgetCardToken } from "@/lib/widgets/widgetCardToken";
import { setHideWidgetAmounts } from "@/lib/widgets/widgetPreferences";
import {
  WIDGET_CAPTURE_STATUS_TTL_MS,
  writeWidgetCaptureStatus,
} from "@/lib/widgets/widgetCaptureMmkv";
import { writeWidgetSnapshot, type WidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";
import { darkColors, lightColors } from "@/theme/palettes";
import { setThemePreference } from "@/theme/themePreference";
import { resetMockMmkv } from "@/test-utils/mockMmkv";
import { formatInrChartAxis, formatInrCompact } from "@/utils/currency";

import { DimeWidget } from "../DimeWidget";
import {
  buildDimeWidgetModel,
  dimeWidgetLayout,
  dimeWidgetShowsCategories,
} from "../dimeWidgetModel";
import { renderKnownWidget, renderWidget } from "../renderWidget";
import { WIDGET_NAMES } from "../widgetNames";
import { HIDDEN_AMOUNT } from "../widgetFormat";
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
    SvgWidget: primitive("SvgWidget"),
    requestWidgetUpdate: jest.fn(),
  };
});

/** The light variant of a themed widget, or the widget itself when only one was rendered. */
function lightOf(widget: WidgetRepresentation) {
  return "light" in widget ? widget.light : widget;
}

const NOW = new Date();
const MONTH_KEY = format(NOW, "yyyy-MM");
const SIZE = { widthDp: 320, heightDp: 200 };
const TOKEN = "a".repeat(32);
/** Rupee text exactly as the widget formats it (the symbol is followed by a narrow no-break space). */
const inr = formatInrCompact;

const SNAPSHOT_FULL: Omit<WidgetSnapshot, "version"> = {
  userId: "user-a",
  updatedAt: NOW.getTime(),
  monthKey: MONTH_KEY,
  spentThisMonth: 6177,
  recurringSpent: 2000,
  flexibleSpent: 4177,
  monthlyBudget: 30000,
  budgetLeft: 23823,
  topCategories: [
    { id: "food", name: "Food", color: "#112233", iconName: null, spent: 1535, budget: 5000 },
    { id: "fuel", name: "Fuel", color: null, iconName: null, spent: 800, budget: null },
  ],
};
const SNAPSHOT: WidgetSnapshot = { ...SNAPSHOT_FULL, version: 2 };

function writeSnapshot(overrides: Record<string, unknown> = {}): void {
  writeWidgetSnapshot({ ...SNAPSHOT_FULL, ...overrides });
}

beforeEach(resetMockMmkv);

describe("buildDimeWidgetModel", () => {
  it("formats the month, the budget line, the split and the top categories", () => {
    const model = buildDimeWidgetModel(SNAPSHOT, NOW);
    expect(model).toMatchObject({
      signedOut: false,
      title: "This month",
      amount: inr(6177),
      budgetLine: `${inr(23823)} left of ${inr(30000)}`,
      progressPercent: 21,
      overBudget: false,
      splitLine: `Recurring ${formatInrChartAxis(2000)} · Flexible ${formatInrChartAxis(4177)}`,
      status: null,
    });
    expect(model.categories).toEqual([
      { id: "food", name: "Food", color: "#112233", amountText: inr(1535), percent: 31, overBudget: false },
      { id: "fuel", name: "Fuel", color: null, amountText: inr(800), percent: 52, overBudget: false },
    ]);
    expect(model.accessibilityLabel).toBe(
      `Dime this month. Spent ${inr(6177)}. ${inr(23823)} left of ${inr(30000)}. Opens Dime.`,
    );
  });

  it("shows just the amount spent when there is no budget, and no split without recurring spend", () => {
    const model = buildDimeWidgetModel(
      { ...SNAPSHOT, monthlyBudget: null, budgetLeft: null, recurringSpent: 0 },
      NOW,
    );
    expect(model.budgetLine).toBeNull();
    expect(model.progressPercent).toBeNull();
    expect(model.splitLine).toBeNull();
  });

  it("flags a month over budget and a category over its cap", () => {
    const model = buildDimeWidgetModel(
      {
        ...SNAPSHOT,
        spentThisMonth: 31000,
        budgetLeft: 0,
        topCategories: [
          { id: "fun", name: "Fun", color: null, iconName: null, spent: 600, budget: 500 },
        ],
      },
      NOW,
    );
    expect(model.overBudget).toBe(true);
    expect(model.progressPercent).toBe(100);
    expect(model.categories[0]).toMatchObject({ overBudget: true, percent: 100 });
  });

  it("keeps at most three categories", () => {
    const topCategories = ["a", "b", "c", "d"].map((id) => ({
      id,
      name: id,
      color: null,
      iconName: null,
      spent: 10,
      budget: null,
    }));
    expect(buildDimeWidgetModel({ ...SNAPSHOT, topCategories }, NOW).categories).toHaveLength(3);
  });

  it("asks to sign in without a snapshot", () => {
    const model = buildDimeWidgetModel(null, NOW);
    expect(model).toMatchObject({ signedOut: true, amount: "Sign in to Dime", categories: [] });
    expect(model.accessibilityLabel).toBe("Dime. Sign in to Dime. Opens the app.");
  });

  it("does not present last month's totals as this month", () => {
    const model = buildDimeWidgetModel({ ...SNAPSHOT, monthKey: "2020-01" }, NOW);
    expect(model).toMatchObject({
      amount: "₹—",
      budgetLine: null,
      categories: [],
      hint: "Open Dime to refresh",
    });
  });

  it("hides every amount, in the status line too, when asked", () => {
    writeWidgetCaptureStatus({
      kind: "added",
      text: "Added ₹250 · Swiggy",
      at: NOW.getTime(),
      userId: "user-a",
    });
    const model = buildDimeWidgetModel(SNAPSHOT, NOW, true);
    expect(model.amount).toBe(HIDDEN_AMOUNT);
    expect(model.budgetLine).toBe(`${HIDDEN_AMOUNT} left of ${HIDDEN_AMOUNT}`);
    expect(model.splitLine).toBe(`Recurring ${HIDDEN_AMOUNT} · Flexible ${HIDDEN_AMOUNT}`);
    expect(model.categories.every((row) => row.amountText === HIDDEN_AMOUNT)).toBe(true);
    expect(model.status?.text).toBe(`Added ${HIDDEN_AMOUNT} · Swiggy`);
  });

  describe("capture status", () => {
    const status = { kind: "added" as const, text: "Added ₹250 · Swiggy", userId: "user-a" };

    it("shows the last capture while it is under ten minutes old", () => {
      writeWidgetCaptureStatus({ ...status, at: NOW.getTime() - 60_000 });
      expect(buildDimeWidgetModel(SNAPSHOT, NOW).status).toEqual({
        kind: "added",
        text: "Added ₹250 · Swiggy",
      });
      expect(buildDimeWidgetModel(SNAPSHOT, NOW).accessibilityLabel).toContain(
        "Added ₹250 · Swiggy.",
      );
    });

    it("drops it after ten minutes, and when it belongs to another account", () => {
      writeWidgetCaptureStatus({
        ...status,
        at: NOW.getTime() - WIDGET_CAPTURE_STATUS_TTL_MS - 1,
      });
      expect(buildDimeWidgetModel(SNAPSHOT, NOW).status).toBeNull();

      writeWidgetCaptureStatus({ ...status, userId: "user-b", at: NOW.getTime() });
      expect(buildDimeWidgetModel(SNAPSHOT, NOW).status).toBeNull();
    });
  });
});

describe("layout", () => {
  it("is full when tall enough or of unknown height, compact when short", () => {
    expect(dimeWidgetLayout(0)).toBe("full");
    expect(dimeWidgetLayout(200)).toBe("full");
    expect(dimeWidgetLayout(169)).toBe("compact");
  });

  it("drops the categories column on a narrow widget", () => {
    expect(dimeWidgetShowsCategories(0)).toBe(true);
    expect(dimeWidgetShowsCategories(320)).toBe(true);
    expect(dimeWidgetShowsCategories(250)).toBe(false);
  });
});

describe("DimeWidget", () => {
  const model = buildDimeWidgetModel(SNAPSHOT, NOW);
  const draw = (overrides: Partial<Parameters<typeof DimeWidget>[0]> = {}) =>
    DimeWidget({
      model,
      colors: lightColors,
      layout: "full",
      showCategories: true,
      cardToken: TOKEN,
      ...overrides,
    });

  it("shows the month, budget line, split line and the top categories", () => {
    const tree = draw();
    expect(widgetTexts(tree)).toEqual(
      expect.arrayContaining([
        "This month",
        model.amount,
        model.budgetLine,
        model.splitLine,
        "Food",
        "Fuel",
        inr(1535),
        inr(800),
      ]),
    );
    expect(tree.props.accessibilityLabel).toBe(model.accessibilityLabel);
  });

  it("opens Home from the month area and has five action buttons in order", () => {
    const tree = draw();
    expect(widgetClickUris(tree)).toEqual([
      deepLinkUrls.home,
      deepLinkUrls.home,
      cardLinkUrl("add", TOKEN),
      cardLinkUrl("scan", TOKEN),
      cardLinkUrl("gallery", TOKEN),
      cardLinkUrl("voice", TOKEN),
      deepLinkUrls.agent,
    ]);
    expect(widgetTexts(tree)).toEqual(
      expect.arrayContaining(["Add", "Scan", "Gallery", "Voice", "Ask AI"]),
    );
  });

  it("carries the card token on the four card links and none on Ask AI", () => {
    const uris = widgetClickUris(draw()).slice(2);
    expect(
      uris.slice(0, 4).every((uri) => uri.startsWith("dimecard://") && uri.endsWith(`?t=${TOKEN}`)),
    ).toBe(true);
    expect(uris[4]).toBe(deepLinkUrls.agent);
  });

  it("renders in every state without a component returning null (the library crashes on that)", () => {
    const models = [
      buildDimeWidgetModel(SNAPSHOT, NOW),
      buildDimeWidgetModel(null, NOW),
      buildDimeWidgetModel({ ...SNAPSHOT, monthKey: "2020-01" }, NOW),
      buildDimeWidgetModel(
        { ...SNAPSHOT, topCategories: [], monthlyBudget: null, budgetLeft: null },
        NOW,
      ),
      {
        ...buildDimeWidgetModel(SNAPSHOT, NOW),
        status: { kind: "reading" as const, text: "Reading receipt…" },
      },
    ];
    for (const m of models) {
      for (const layout of ["full", "compact"] as const) {
        for (const showCategories of [true, false]) {
          expect(() => flattenWidgetTree(draw({ model: m, layout, showCategories }))).not.toThrow();
        }
      }
    }
  });

  it("labels every button for screen readers", () => {
    const labels = flattenWidgetTree(draw())
      .filter((element) => element.props.clickAction === "OPEN_URI")
      .map((element) => element.props.accessibilityLabel);
    expect(labels.slice(2)).toEqual(["Add", "Scan", "Gallery", "Voice", "Ask AI"]);
  });

  it("fills Add with the accent and draws one palette-coloured icon per button", () => {
    const tree = draw();
    const styles = widgetStyles(tree);
    const buttons = styles.filter((style) => style.height === 52);
    expect(buttons.map((style) => style.backgroundColor)).toEqual([
      lightColors.accent,
      lightColors.surfaceSunken,
      lightColors.surfaceSunken,
      lightColors.surfaceSunken,
      lightColors.surfaceSunken,
    ]);
    const icons = flattenWidgetTree(tree).filter((element) => typeof element.props.svg === "string");
    expect(icons).toHaveLength(5);
    expect(icons[0]!.props.svg).toContain(`stroke="${lightColors.onAccent}"`);
    expect(icons[1]!.props.svg).toContain(`stroke="${lightColors.ink}"`);
  });

  it("draws the budget bar as weighted segments that sum to 100", () => {
    const weights = widgetStyles(draw())
      .map((style) => style.flex)
      .filter((flex): flex is number => typeof flex === "number" && flex > 1);
    expect(weights).toEqual(expect.arrayContaining([model.progressPercent, 100 - model.progressPercent!]));
  });

  it("gives a category its own colour and falls back to the accent", () => {
    const styles = widgetStyles(draw());
    expect(styles.some((style) => style.backgroundColor === "#112233")).toBe(true);
    expect(styles.some((style) => style.backgroundColor === lightColors.accent)).toBe(true);
  });

  it("uses the danger colour for a category over its cap", () => {
    const over = buildDimeWidgetModel(
      {
        ...SNAPSHOT,
        topCategories: [
          { id: "fun", name: "Fun", color: "#112233", iconName: null, spent: 600, budget: 500 },
        ],
      },
      NOW,
    );
    const styles = widgetStyles(draw({ model: over }));
    expect(styles.some((style) => style.backgroundColor === lightColors.danger)).toBe(true);
  });

  it("drops the categories and the split line at smaller sizes, and keeps the buttons", () => {
    const compact = draw({ layout: "compact" });
    expect(widgetTexts(compact)).not.toContain("Food");
    expect(widgetTexts(compact)).not.toContain(model.splitLine);
    expect(widgetTexts(compact)).toEqual(expect.arrayContaining([model.amount, "Add", "Ask AI"]));

    const narrow = draw({ showCategories: false });
    expect(widgetTexts(narrow)).not.toContain("Food");
    expect(widgetTexts(narrow)).toContain(model.splitLine);
  });

  it("shows the status line, coloured by what happened", () => {
    const colourOf = (kind: "reading" | "added" | "failed") => {
      const statusModel = {
        ...model,
        status: { kind, text: `status ${kind}` },
      };
      const tree = draw({ model: statusModel });
      return (
        flattenWidgetTree(tree).find((element) => element.props.text === `status ${kind}`)?.props
          .style as { color: string }
      ).color;
    };
    expect(colourOf("added")).toBe(lightColors.success);
    expect(colourOf("failed")).toBe(lightColors.danger);
    expect(colourOf("reading")).toBe(lightColors.inkSoft);
    expect(widgetTexts(draw())).not.toContain("status added");
  });

  it("signed out: the prompt that opens the app, and no action buttons", () => {
    const tree = draw({ model: buildDimeWidgetModel(null, NOW) });
    expect(widgetTexts(tree)).toContain("Sign in to Dime");
    expect(widgetTexts(tree)).not.toContain("Add");
    expect(widgetClickUris(tree)).toEqual([deepLinkUrls.home, deepLinkUrls.home]);
  });

  it("uses the palette it is given", () => {
    expect(widgetStyles(draw())[0]!.backgroundColor).toBe(lightColors.surface);
    expect(widgetStyles(draw({ colors: darkColors }))[0]!.backgroundColor).toBe(darkColors.surface);
  });
});

describe("widget tree helper", () => {
  it("rejects a component that renders nothing, like the library does", () => {
    const Empty = () => null;
    expect(() => flattenWidgetTree(<Empty />)).toThrow("returned null");
  });
});

describe("renderKnownWidget", () => {
  it("puts this install token in the card links", () => {
    writeSnapshot();
    const uris = widgetClickUris(lightOf(renderKnownWidget("Dime", SIZE)));
    expect(uris[2]).toBe(cardLinkUrl("add", getWidgetCardToken()));
  });

  it("follows the OS when the app theme is System default", () => {
    writeSnapshot();
    const widget = renderKnownWidget("Dime", SIZE);
    expect(widget).toHaveProperty("light");
    expect(widget).toHaveProperty("dark");
  });

  it("renders a single variant when the app theme is forced", () => {
    writeSnapshot();
    setThemePreference("dark");
    const widget = renderKnownWidget("Dime", SIZE);
    expect(widget).not.toHaveProperty("light");
    expect(widgetStyles(lightOf(widget))[0]!.backgroundColor).toBe(darkColors.surface);

    setThemePreference("light");
    expect(widgetStyles(lightOf(renderKnownWidget("Dime", SIZE)))[0]!.backgroundColor).toBe(
      lightColors.surface,
    );
  });

  it("draws the stored snapshot, and the sign-in prompt when there is none", () => {
    writeSnapshot();
    expect(widgetTexts(lightOf(renderKnownWidget("Dime", SIZE)))).toEqual(
      expect.arrayContaining([inr(6177), "Food"]),
    );

    resetMockMmkv();
    expect(widgetTexts(lightOf(renderKnownWidget("Dime", SIZE)))).toContain("Sign in to Dime");
  });

  it("picks the layout from the widget size", () => {
    writeSnapshot();
    const full = widgetTexts(lightOf(renderKnownWidget("Dime", SIZE)));
    const short = widgetTexts(lightOf(renderKnownWidget("Dime", { widthDp: 320, heightDp: 120 })));
    const narrow = widgetTexts(lightOf(renderKnownWidget("Dime", { widthDp: 250, heightDp: 200 })));
    expect(full).toContain("Food");
    expect(short).not.toContain("Food");
    expect(narrow).not.toContain("Food");
  });

  it("has a root accessibility label", () => {
    writeSnapshot();
    const root = flattenWidgetTree(lightOf(renderKnownWidget("Dime", SIZE)))[0]!;
    expect(root.props.accessibilityLabel).toEqual(expect.stringContaining("Dime"));
  });

  it("hides amounts when the preference is on", () => {
    writeSnapshot();
    setHideWidgetAmounts(true);
    const texts = widgetTexts(lightOf(renderKnownWidget("Dime", SIZE)));
    expect(texts).toContain(HIDDEN_AMOUNT);
    expect(texts).not.toContain(inr(6177));
  });

  it("shows the capture status from storage", () => {
    writeSnapshot();
    writeWidgetCaptureStatus({
      kind: "reading",
      text: "Reading receipt…",
      at: Date.now(),
      userId: "user-a",
      jobId: "job-1",
    });
    expect(widgetTexts(lightOf(renderKnownWidget("Dime", SIZE)))).toContain("Reading receipt…");
  });

  it("ignores widgets this build does not know (the 1.1.0 names are gone)", () => {
    const info = (widgetName: string): WidgetInfo => ({
      widgetName,
      widgetId: 1,
      height: 200,
      width: 320,
      screenInfo: { screenHeightDp: 0, screenWidthDp: 0, density: 1, densityDpi: 160 },
    });
    expect(renderWidget(info("ThisMonth"))).toBeNull();
    expect(renderWidget(info("QuickAdd"))).toBeNull();
    expect(renderWidget(info("Dime"))).not.toBeNull();
    expect(WIDGET_NAMES).toEqual(["Dime"]);
  });
});
