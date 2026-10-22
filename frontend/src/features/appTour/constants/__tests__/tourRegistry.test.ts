import * as fs from "fs";
import * as path from "path";

import { tourTargetIds } from "@/constants/tourTargetIds";
import { tourEventNames } from "@/lib/tour/tourEvents";

import {
  findTourStepIndex,
  getStepScreen,
  getTour,
  getTourActionStepCount,
  getTourActionStepNumber,
  getTourOwnedScreens,
  TOUR_COUNT,
  TOUR_ORDER,
  TOURS,
  tourIdForTab,
} from "../tourRegistry";
import type { TourId, TourScreen, TourStep, TourTab } from "../tourTypes";

const SRC_ROOT = path.resolve(__dirname, "../../../..");
const TABS: TourTab[] = ["Home", "Transactions", "Budgets", "Insights"];
const SCREENS: TourScreen[] = [
  ...TABS,
  "TransactionDetail",
  "TransactionsList",
  "RecurringEditor",
  "InsightsMonthCompare",
];
const SCROLL_KEYS = ["home", "transactions", "budgets", "insights"];
/** Card actions the app itself runs; every other one is a command a screen registers. */
const BUILT_IN_ACTIONS = ["openFab", "openManualAdd"];

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : listSourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const allSource = listSourceFiles(SRC_ROOT).map((file) => ({
  file,
  text: fs.readFileSync(file, "utf8"),
}));
const outsideAppTour = allSource.filter(
  ({ file }) => !file.includes(`${path.sep}appTour${path.sep}`),
);

const allSteps = TOUR_ORDER.flatMap((id) =>
  getTour(id).steps.map((step, index) => ({ id, step, index })),
);
const isDo = (step: TourStep) => step.kind === "do";

describe("the tour registry", () => {
  it("lists every tour once, in order, keyed by its own id", () => {
    expect(new Set(TOUR_ORDER).size).toBe(TOUR_ORDER.length);
    expect(Object.keys(TOURS).sort()).toEqual([...TOUR_ORDER].sort());
    expect(TOUR_COUNT).toBe(7);
    expect(TOUR_ORDER[0]).toBe("firstExpense");
    for (const id of TOUR_ORDER) {
      expect(TOURS[id].id).toBe(id);
    }
  });

  it("gives each tour a title, a summary, an icon and a length like ~25 s", () => {
    for (const id of TOUR_ORDER) {
      const tour = getTour(id);
      expect(tour.title.trim().length).toBeGreaterThan(0);
      expect(tour.summary.trim().length).toBeGreaterThan(0);
      expect(tour.icon).toBeDefined();
      expect(tour.durationLabel).toMatch(/^~\d+ s$/);
    }
  });

  it("only the first-run tour starts by itself", () => {
    const auto = TOUR_ORDER.filter((id) => getTour(id).autoStart);
    expect(auto).toEqual(["firstExpense"]);
  });

  it("opens each tab's tour from its own tab", () => {
    expect(TABS.map(tourIdForTab)).toEqual([
      "home",
      "transactions",
      "budgets",
      "insights",
    ]);
    for (const tab of TABS) {
      expect(getTour(tourIdForTab(tab)).tab).toBe(tab);
    }
  });

  it("gives the tab tours 4 to 8 numbered steps, and the other tours at least 3", () => {
    for (const id of ["home", "transactions", "budgets", "insights"] as TourId[]) {
      expect(getTourActionStepCount(id)).toBeGreaterThanOrEqual(4);
      expect(getTourActionStepCount(id)).toBeLessThanOrEqual(8);
    }
    expect(getTourActionStepCount("askAi")).toBeGreaterThanOrEqual(3);
    expect(getTourActionStepCount("addMenu")).toBeGreaterThanOrEqual(3);
  });

  describe.each(TOUR_ORDER)("%s", (id) => {
    const tour = getTour(id);
    const steps = tour.steps;

    it("has unique step ids and copy on every step", () => {
      const ids = steps.map((step) => step.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const step of steps) {
        expect(step.title.trim().length).toBeGreaterThan(0);
        expect(step.body.trim().length).toBeGreaterThan(0);
      }
    });

    it("ends with its finish card, and the first-run tour starts with a welcome card", () => {
      expect(steps[steps.length - 1].kind).toBe("finale");
      expect(steps.filter((step) => step.kind === "finale")).toHaveLength(1);
      if (id === "firstExpense") {
        expect(steps[0].kind).toBe("welcome");
        expect(steps[0].skipLabel).toBe("Not now");
      } else {
        expect(steps.some((step) => step.kind === "welcome")).toBe(false);
      }
    });

    it("lets the user leave on the first step with the hardware back button", () => {
      expect(steps[0].backExits).toBe(true);
    });

    it("points watch and do steps at a known target, and card steps at none", () => {
      const known = new Set<string>(Object.values(tourTargetIds));
      for (const step of steps) {
        if (step.kind === "watch" || step.kind === "do") {
          expect(step.targetId).toBeDefined();
          expect(known.has(step.targetId as string)).toBe(true);
        } else {
          expect(step.targetId).toBeUndefined();
        }
        if (step.revealVia) {
          expect(known.has(step.revealVia)).toBe(true);
          expect(step.scrollKey).toBeDefined();
        }
        if (step.scrollKey) {
          expect(SCROLL_KEYS).toContain(step.scrollKey);
        }
      }
    });

    it("gives every do step an event to wait for and a card button that does it for the user", () => {
      for (const step of steps.filter(isDo)) {
        expect((step.advanceOn ?? "").length).toBeGreaterThan(0);
        expect(step.action).toBeDefined();
        expect((step.actionLabel ?? "").trim().length).toBeGreaterThan(0);
      }
      for (const step of steps.filter((s) => !isDo(s))) {
        // Only the do steps wait for the user; the pencil step's save is the one that is not a tap.
        expect(step.advanceOn).toBeUndefined();
      }
    });

    it("uses only known screens", () => {
      for (const step of steps) {
        if (step.screen) {
          expect(SCREENS).toContain(step.screen);
        }
        const screen = getStepScreen(id, step);
        if (screen) {
          expect(SCREENS).toContain(screen);
        }
      }
    });

    it("reaches every pushed screen by the tap before it (or by opening it itself)", () => {
      steps.forEach((step, index) => {
        const screen = getStepScreen(id, step);
        if (!screen || TABS.includes(screen as TourTab)) {
          return;
        }
        expect(index).toBeGreaterThan(0);
        const previous = steps[index - 1];
        const opensItself = step.enter?.includes("openCompare") === true;
        const afterTap = isDo(previous);
        // Or it follows another step on the same pushed screen.
        const sameScreen = getStepScreen(id, previous) === screen;
        expect(opensItself || afterTap || sameScreen).toBe(true);
      });
    });

    it("owns its tab (or every tab), and every screen its steps visit", () => {
      const owned = getTourOwnedScreens(id);
      for (const step of steps) {
        const screen = getStepScreen(id, step);
        if (screen) {
          expect(owned.has(screen)).toBe(true);
        }
      }
      if (tour.tab && !tour.ownsAllTabs) {
        expect(owned.has(tour.tab)).toBe(true);
        expect(TABS.filter((tab) => owned.has(tab))).toEqual([tour.tab]);
      } else {
        expect(TABS.every((tab) => owned.has(tab))).toBe(true);
      }
    });

    it("only samples known kinds of data", () => {
      for (const domain of tour.sample ?? []) {
        expect(["transactions", "budget", "recurring"]).toContain(domain);
      }
    });
  });

  it("counts only the numbered steps in the progress", () => {
    expect(getTourActionStepCount("firstExpense")).toBe(3);
    expect(
      getTour("firstExpense").steps.map((_, i) => getTourActionStepNumber("firstExpense", i)),
    ).toEqual([null, 1, 2, 3, null]);
    expect(getTourActionStepNumber("firstExpense", 99)).toBeNull();
    const home = getTour("home").steps;
    expect(getTourActionStepNumber("home", 0)).toBe(1);
    expect(getTourActionStepNumber("home", home.length - 1)).toBeNull();
  });

  describe("the first-run tour", () => {
    it("is welcome, +, pencil, recap, finish", () => {
      expect(getTour("firstExpense").steps.map((step) => step.id)).toEqual([
        "welcome",
        "addFab",
        "fabManual",
        "homeRecent",
        "finale",
      ]);
    });

    it("waits for the + menu to open, then for a saved transaction", () => {
      const steps = getTour("firstExpense").steps;
      expect(steps[findTourStepIndex("firstExpense", "addFab")].advanceOn).toBe("fabOpened");
      expect(steps[findTourStepIndex("firstExpense", "fabManual")].advanceOn).toBe(
        "transactionSaved",
      );
    });

    it("keeps the + menu open while it points at the pencil", () => {
      const step = getTour("firstExpense").steps[findTourStepIndex("firstExpense", "fabManual")];
      expect(step.holdFab).toBe(true);
      expect(step.enter).toContain("openFab");
    });

    it("has gentler wording for coming back to the + step", () => {
      expect(
        getTour("firstExpense").steps[findTourStepIndex("firstExpense", "addFab")].retryBody,
      ).toMatch(/no worries/i);
    });

    it("points at ? on its finish card", () => {
      const finale = getTour("firstExpense").steps.at(-1);
      expect(finale?.body).toMatch(/tap \?/i);
    });
  });

  describe("the tours that need the app's own cooperation", () => {
    it("the Ask AI tour shows a scripted chat, allows its chat and closes it when it ends", () => {
      const tour = getTour("askAi");
      expect(tour.scriptedChat).toBe(true);
      expect(tour.allowsAgentChat).toBe(true);
      expect(tour.cleanup).toContain("closeAgent");
      expect(tour.steps[0].enter).toContain("openAgent");
      expect(tour.sample ?? []).toEqual([]);
    });

    it("the + menu tour closes the menu when it ends", () => {
      expect(getTour("addMenu").cleanup).toContain("closeFab");
    });

    it("no other tour is scripted or allows the chat", () => {
      for (const id of TOUR_ORDER.filter((tourId) => tourId !== "askAi")) {
        expect(getTour(id).scriptedChat).toBeUndefined();
        expect(getTour(id).allowsAgentChat).toBeUndefined();
      }
    });
  });
});

describe("tour wiring in the app", () => {
  const contents = outsideAppTour
    .filter(({ file }) => !file.endsWith("tourTargetIds.ts"))
    .map(({ text }) => text);

  it.each(Object.entries(tourTargetIds))(
    "has a UI element claiming tourTargetIds.%s",
    (key) => {
      const claimed = contents.some(
        (source) =>
          source.includes(`tourTargetIds.${key}`) &&
          /useTourTarget\(|<TourTarget|<OptionalTourTarget|tourTargetId=/.test(source),
      );
      expect(claimed).toBe(true);
    },
  );

  it("every step target is claimed by some UI element", () => {
    const keyById = new Map(Object.entries(tourTargetIds).map(([key, id]) => [id, key]));
    for (const { step } of allSteps) {
      for (const targetId of [step.targetId, step.revealVia]) {
        if (!targetId) continue;
        const key = keyById.get(targetId);
        expect(key).toBeDefined();
        expect(contents.some((source) => source.includes(`tourTargetIds.${key}`))).toBe(true);
      }
    }
  });

  it("every do step's action is built in or registered by a screen", () => {
    const sources = outsideAppTour.map(({ text }) => text);
    for (const { step } of allSteps.filter(({ step: s }) => isDo(s))) {
      const action = step.action as string;
      if (BUILT_IN_ACTIONS.includes(action)) continue;
      expect(
        sources.some((source) => source.includes(`useTourCommand("${action}"`)),
      ).toBe(true);
    }
  });

  it("every do step's event is raised by the app", () => {
    const events = Object.entries(tourEventNames);
    const sources = allSource.map(({ text }) => text);
    for (const { step } of allSteps.filter(({ step: s }) => isDo(s))) {
      const advanceOn = step.advanceOn as string;
      if (advanceOn === "transactionSaved") {
        expect(
          sources.some((source) => source.includes("onTransactionSaved()")),
        ).toBe(true);
        continue;
      }
      const entry = events.find(([, name]) => name === advanceOn);
      expect(entry).toBeDefined();
      const key = entry?.[0] as string;
      expect(
        sources.some(
          (source) =>
            source.includes(`emitTourEvent(tourEventNames.${key}`),
        ),
      ).toBe(true);
    }
  });

  it("every scroll key is registered by a screen", () => {
    const sources = outsideAppTour.map(({ text }) => text);
    const used = new Set(allSteps.flatMap(({ step }) => (step.scrollKey ? [step.scrollKey] : [])));
    for (const key of used) {
      expect(sources.some((source) => source.includes(`useTourScroller("${key}"`))).toBe(true);
    }
  });
});
