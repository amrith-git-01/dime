import { formatInrAmount, formatInrCompact } from "@/utils/currency";

import { addedText, formatElapsed } from "../captureText";

describe("addedText", () => {
  it("is 'Added ₹250 · Swiggy' for whole rupees", () => {
    expect(addedText("250.00", "Swiggy")).toBe(`Added ${formatInrCompact(250)} · Swiggy`);
    expect(addedText(250, "  Swiggy ")).toBe(`Added ${formatInrCompact(250)} · Swiggy`);
  });

  it("keeps the paise when there are some", () => {
    expect(addedText("250.50", "Swiggy")).toBe(`Added ${formatInrAmount(250.5)} · Swiggy`);
  });

  it("falls back to a generic name, and shows a negative amount as a magnitude", () => {
    expect(addedText("12.00", null)).toBe(`Added ${formatInrCompact(12)} · Expense`);
    expect(addedText("12.00", "", "credit")).toBe(`Added ${formatInrCompact(12)} · Income`);
    expect(addedText("-12.00", "Chai")).toBe(`Added ${formatInrCompact(12)} · Chai`);
  });
});

describe("formatElapsed", () => {
  it("is m:ss, and never negative", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(4.9)).toBe("0:04");
    expect(formatElapsed(65)).toBe("1:05");
    expect(formatElapsed(600)).toBe("10:00");
    expect(formatElapsed(-3)).toBe("0:00");
  });
});
