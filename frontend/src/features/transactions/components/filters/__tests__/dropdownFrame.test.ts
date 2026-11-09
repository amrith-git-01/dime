import { dropdownFrame } from "../dropdownFrame";

const SCREEN = { width: 411, height: 914 };
// A chip under the search field, as measured in the app's window.
const CHIP = { x: 16, y: 280, width: 72, height: 32 };

describe("dropdownFrame", () => {
  it("hangs the dropdown just under the chip", () => {
    const frame = dropdownFrame(CHIP, SCREEN);
    expect(frame.top).toBe(280 + 32 + 6);
    expect(frame.left).toBe(16);
  });

  it("adds the status bar offset to the chip's y", () => {
    expect(dropdownFrame(CHIP, SCREEN, 49).top).toBe(280 + 49 + 32 + 6);
  });

  it("keeps the dropdown inside the side margins", () => {
    const frame = dropdownFrame({ ...CHIP, x: 380 }, SCREEN);
    expect(frame.left + frame.width).toBeLessThanOrEqual(SCREEN.width - 12);
    expect(dropdownFrame({ ...CHIP, x: 2 }, SCREEN).left).toBe(12);
  });

  it("never offers less than 160 of height", () => {
    const frame = dropdownFrame({ ...CHIP, y: 880 }, SCREEN);
    expect(frame.maxHeight).toBe(160);
  });
});
