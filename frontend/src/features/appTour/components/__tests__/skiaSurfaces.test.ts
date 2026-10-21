import * as fs from "fs";
import * as path from "path";

/**
 * Every Skia <Canvas> is a GL window surface, and creating one on the UI thread can take seconds on
 * a weak phone (it caused ANRs). A guided tour keeps exactly one (its scrim, which also draws the
 * ring, ripple, zoom-through and sparkle trail), and the celebration layer keeps one for the app:
 * everything else the tours draw is Reanimated views and SVG.
 */
const SRC = path.resolve(__dirname, "../../../..");

function canvasCount(relative: string): number {
  const text = fs.readFileSync(path.join(SRC, relative), "utf8");
  return (text.match(/<Canvas\b/g) ?? []).length;
}

describe("Skia surfaces used by the tours and celebrations", () => {
  it("the tour's components have exactly one canvas: the scrim", () => {
    const dir = path.join(SRC, "features/appTour/components");
    const withCanvas = fs
      .readdirSync(dir)
      .filter((file) => /\.tsx$/.test(file))
      .filter((file) => canvasCount(`features/appTour/components/${file}`) > 0);
    expect(withCanvas).toEqual(["TourScrim.tsx"]);
    expect(canvasCount("features/appTour/components/TourScrim.tsx")).toBe(1);
  });

  it("the celebration layer has one canvas, kept for the app", () => {
    expect(canvasCount("components/celebrations/CelebrationLayer.tsx")).toBe(1);
  });

  it("the session makes the scrim once for the run, not per step or per pause", () => {
    const text = fs.readFileSync(
      path.join(SRC, "features/appTour/components/AppTourOverlay.tsx"),
      "utf8",
    );
    const stage = text.slice(text.indexOf("function TourStage"), text.indexOf("function TourSession"));
    expect(stage).not.toContain("<TourScrim");
    expect(text.slice(text.indexOf("function TourSession"))).toContain("<TourScrim");
  });
});
