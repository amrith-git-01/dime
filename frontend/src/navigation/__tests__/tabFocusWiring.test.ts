import * as fs from "fs";
import * as path from "path";

/**
 * The floating "?" must appear on a cold start. The container's "state" event does not fire when
 * the tab navigator first mounts, so the tabs report focus themselves; this guards that wiring
 * (rendering the whole navigator needs native modules).
 */
describe("the tab navigator reports focus to the guided tours", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../MainTabNavigator.tsx"),
    "utf8",
  );

  it("passes notifyTourTabFocused as the tabs' focus listener", () => {
    expect(source).toContain("notifyTourTabFocused");
    expect(source).toMatch(/screenListeners=\{\{[\s\S]*focus:\s*notifyTourTabFocused/);
  });
});
