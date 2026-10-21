import * as fs from "fs";
import * as path from "path";

const SRC_ROOT = path.resolve(__dirname, "../../..");

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : listSourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const sources = listSourceFiles(SRC_ROOT).map((file) => ({
  file: path.relative(SRC_ROOT, file),
  text: fs.readFileSync(file, "utf8"),
}));

/** The "?" tours replaced the first-use tip cards (voice, budgets, recurring, insights, Ask AI, first scan). */
describe("the first-use tip cards are retired", () => {
  it.each([
    "FirstUseTip",
    "firstUseTipStorage",
    "hasSeenFirstUseTip",
    "markFirstUseTipSeen",
    "first_use_tip",
    "scanTip",
    "takeScanTip",
    "SCAN_TIP",
  ])("nothing references %s", (needle) => {
    const hits = sources.filter(({ text }) => text.includes(needle)).map(({ file }) => file);
    expect(hits).toEqual([]);
  });

  it("their component, storage and scan-toast files are gone", () => {
    for (const gone of [
      "features/onboarding/components/FirstUseTip.tsx",
      "lib/onboarding/firstUseTipStorage.ts",
      "features/onboarding/utils/scanTip.ts",
    ]) {
      expect(fs.existsSync(path.join(SRC_ROOT, gone))).toBe(false);
    }
  });

  it("the first receipt upload says the plain thing, like every other one", () => {
    const camera = sources.find(({ file }) =>
      file.endsWith(path.join("hooks", "useReceiptCameraTransaction.ts")),
    );
    expect(camera?.text).toContain('message: "Receipt added for processing"');
  });
});
