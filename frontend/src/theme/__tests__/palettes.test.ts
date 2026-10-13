import { contrastRatio, readableCategoryColor, withAlpha } from "@/constants/colorUtils";

import { darkColors, darkTheme, getTheme, lightColors, lightTheme } from "../palettes";

/** Recursively lists `a.b.c` paths so palettes can be compared structurally. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return [`${prefix}[${value.length}]`];
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([key, child]) =>
        keyPaths(child, prefix ? `${prefix}.${key}` : key),
      )
      .sort();
  }
  return [prefix];
}

describe("palettes", () => {
  it("light and dark share identical keys", () => {
    expect(keyPaths(darkColors)).toEqual(keyPaths(lightColors));
  });

  it("themes expose the same shadow and typography keys", () => {
    expect(Object.keys(darkTheme.shadows).sort()).toEqual(
      Object.keys(lightTheme.shadows).sort(),
    );
    expect(keyPaths(darkTheme.typography)).toEqual(
      keyPaths(lightTheme.typography),
    );
  });

  it("is frozen, one object per scheme", () => {
    expect(Object.isFrozen(lightColors)).toBe(true);
    expect(Object.isFrozen(darkColors.overlays)).toBe(true);
    expect(Object.isFrozen(darkTheme)).toBe(true);
    expect(getTheme("dark")).toBe(getTheme("dark"));
    expect(getTheme("light")).toBe(lightTheme);
  });

  it("keeps text on the dark surfaces readable (WCAG AA, 4.5:1)", () => {
    const { surface, paper } = darkColors;
    const text = [
      "ink",
      "inkSoft",
      "accentText",
      "success",
      "danger",
      "warning",
    ] as const;
    for (const key of text) {
      expect(contrastRatio(darkColors[key], surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(darkColors[key], paper)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps labels readable on solid fills in dark", () => {
    expect(
      contrastRatio(darkColors.onAccent, darkColors.accent),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(darkColors.onInk, darkColors.ink),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(darkColors.onDanger, darkColors.danger),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(darkColors.onSuccess, darkColors.success),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps primary light text readable", () => {
    for (const key of ["ink", "inkSoft", "accentText"] as const) {
      expect(
        contrastRatio(lightColors[key], lightColors.surface),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("draws the dark page darker than cards, cards darker than sunken fills", () => {
    const luminance = (hex: string) => contrastRatio(hex, "#000000");
    expect(luminance(darkColors.paper)).toBeLessThan(luminance(darkColors.surface));
    expect(luminance(darkColors.surface)).toBeLessThan(
      luminance(darkColors.surfaceSunken),
    );
  });
});

describe("color helpers", () => {
  it("applies alpha to hex and rgb colors and leaves unknown formats alone", () => {
    expect(withAlpha("#FF0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    expect(withAlpha("#f00", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    expect(withAlpha("rgba(1, 2, 3, 0.9)", 0.2)).toBe("rgba(1, 2, 3, 0.2)");
    expect(withAlpha("transparent", 0.2)).toBe("transparent");
  });

  it("lifts deep category colors in dark only", () => {
    const navy = "#0A1F44";
    const lifted = readableCategoryColor(navy, "dark");
    expect(lifted).not.toBe(navy);
    expect(contrastRatio(lifted, darkColors.surface)).toBeGreaterThanOrEqual(4.4);
    expect(readableCategoryColor(navy, "light")).toBe(navy);
    expect(readableCategoryColor("#FBBF24", "dark")).toBe("#FBBF24");
    expect(readableCategoryColor("not-a-color", "dark")).toBe("not-a-color");
  });
});
