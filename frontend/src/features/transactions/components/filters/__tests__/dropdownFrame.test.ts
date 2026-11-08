import { dropdownFrame } from "../dropdownFrame";

const SCREEN = { width: 411, height: 914 };
// A chip under the search field, as measured in the app's window.
const CHIP = { x: 16, y: 280, width: 72, height: 32 };

describe("dropdownFrame", () => {
  it("hangs the dropdown just under the chip when both windows share an origin", () => {
    const frame = dropdownFrame(CHIP, { x: 0, y: 0 }, SCREEN);
    expect(frame.top).toBe(280 + 32 + 6);
    expect(frame.left).toBe(16);
  });

  it("corrects for a Modal that starts above the app's window origin (Android status bar)", () => {
    // The Modal's corner measures 44 above the app window's origin: the status bar.
    const frame = dropdownFrame(CHIP, { x: 0, y: -44 }, SCREEN);
    expect(frame.top).toBe(280 + 44 + 32 + 6);
  });

  it("keeps the dropdown inside the side margins", () => {
    const frame = dropdownFrame({ ...CHIP, x: 380 }, { x: 0, y: 0 }, SCREEN);
    expect(frame.left + frame.width).toBeLessThanOrEqual(SCREEN.width - 12);
    expect(dropdownFrame({ ...CHIP, x: 2 }, { x: 0, y: 0 }, SCREEN).left).toBe(12);
  });

  it("never offers less than 160 of height", () => {
    const frame = dropdownFrame({ ...CHIP, y: 880 }, { x: 0, y: 0 }, SCREEN);
    expect(frame.maxHeight).toBe(160);
  });
});
