import * as fs from "fs";
import * as path from "path";

import { tourTargetIds } from "@/constants/tourTargetIds";

import {
  findTourStepIndex,
  getTourActionStepNumber,
  TOUR_ACTION_STEP_COUNT,
  TOUR_STEPS,
} from "../tourSteps";

const SRC_ROOT = path.resolve(__dirname, "../../../..");

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : listSourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("tour steps", () => {
  it("have unique ids", () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("start with the welcome card and end with the finale", () => {
    expect(TOUR_STEPS[0].kind).toBe("welcome");
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].kind).toBe("finale");
  });

  it("give every step copy", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.trim().length).toBeGreaterThan(0);
      expect(step.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("point spotlight steps at a known target and card steps at none", () => {
    const known = new Set<string>(Object.values(tourTargetIds));
    for (const step of TOUR_STEPS) {
      if (step.kind === "spotlight") {
        expect(step.targetId).toBeDefined();
        expect(known.has(step.targetId as string)).toBe(true);
      } else {
        expect(step.targetId).toBeUndefined();
      }
    }
  });

  it("only wait on the user (tapTarget) when the step can advance by itself", () => {
    for (const step of TOUR_STEPS) {
      if (step.interaction === "tapTarget") {
        expect(step.advanceOn).toBeDefined();
      }
    }
  });

  it("give every tapTarget step a card button that does the action (TalkBack, hard-to-find targets)", () => {
    for (const step of TOUR_STEPS) {
      if (step.interaction === "tapTarget") {
        expect(step.action).toBeDefined();
        expect((step.actionLabel ?? "").trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("let the user leave on every step except the finale", () => {
    const welcome = TOUR_STEPS[0];
    expect(welcome.skipLabel).toBe("Not now");
    // Spotlight steps show "Skip tour" in their header; the finale has no skip.
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].skipLabel).toBeUndefined();
  });
});

describe("the first-expense flow", () => {
  it("is welcome, +, pencil, recap, finish", () => {
    expect(TOUR_STEPS.map((step) => step.id)).toEqual([
      "welcome",
      "addFab",
      "fabManual",
      "homeRecent",
      "finale",
    ]);
  });

  it("waits for the + menu to open, then for a saved transaction", () => {
    expect(TOUR_STEPS[findTourStepIndex("addFab")].advanceOn).toBe("fabOpened");
    expect(TOUR_STEPS[findTourStepIndex("fabManual")].advanceOn).toBe(
      "transactionSaved",
    );
  });

  it("keeps the + menu open while it points at the pencil", () => {
    const step = TOUR_STEPS[findTourStepIndex("fabManual")];
    expect(step.holdFab).toBe(true);
    expect(step.enter).toContain("openFab");
  });

  it("has gentler wording for coming back to the + step", () => {
    expect(TOUR_STEPS[findTourStepIndex("addFab")].retryBody).toMatch(/no worries/i);
  });

  it("counts only the action steps in the progress", () => {
    expect(TOUR_ACTION_STEP_COUNT).toBe(3);
    expect(TOUR_STEPS.map((_, i) => getTourActionStepNumber(i))).toEqual([
      null,
      1,
      2,
      3,
      null,
    ]);
    expect(getTourActionStepNumber(99)).toBeNull();
  });
});

describe("tour target registry coverage", () => {
  const files = listSourceFiles(SRC_ROOT).filter(
    (file) => !file.includes(`${path.sep}appTour${path.sep}`),
  );
  const contents = files
    .filter((file) => !file.endsWith(`tourTargetIds.ts`))
    .map((file) => fs.readFileSync(file, "utf8"));

  it.each(Object.entries(tourTargetIds))(
    "has a UI element claiming tourTargetIds.%s",
    (key) => {
      const claimed = contents.some(
        (source) =>
          source.includes(`tourTargetIds.${key}`) &&
          /useTourTarget\(|<TourTarget/.test(source),
      );
      expect(claimed).toBe(true);
    },
  );

  it("every step target is claimed by some UI element", () => {
    const keyById = new Map(
      Object.entries(tourTargetIds).map(([key, id]) => [id, key]),
    );
    for (const step of TOUR_STEPS) {
      if (!step.targetId) continue;
      const key = keyById.get(step.targetId);
      expect(key).toBeDefined();
      expect(
        contents.some((source) => source.includes(`tourTargetIds.${key}`)),
      ).toBe(true);
    }
  });
});
