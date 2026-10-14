import * as fs from "fs";
import * as path from "path";

import { tourTargetIds } from "@/constants/tourTargetIds";

import { TOUR_STEPS } from "../tourSteps";

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
