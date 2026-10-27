import { contrastRatio } from "@/constants/colorUtils";
import {
  reportPaletteDark,
  reportPaletteLight,
  type ReportPalette,
} from "@/constants/reportPalette";

import { darkColors, lightColors } from "../palettes";

const SCHEMES: [string, ReportPalette][] = [
  ["light", reportPaletteLight],
  ["dark", reportPaletteDark],
];

describe("report palette", () => {
  it("is exposed through both themes", () => {
    expect(lightColors.report).toBe(reportPaletteLight);
    expect(darkColors.report).toBe(reportPaletteDark);
    expect(Object.keys(reportPaletteLight)).toEqual(Object.keys(reportPaletteDark));
    expect(Object.keys(reportPaletteLight)).toHaveLength(8);
  });

  describe.each(SCHEMES)("%s tones", (_scheme, palette) => {
    it.each(Object.entries(palette))(
      "%s: text is readable on its background and panel (AA 4.5:1)",
      (_id, tone) => {
        for (const surface of [tone.bg, tone.panel]) {
          expect(contrastRatio(tone.text, surface)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(tone.textSoft, surface)).toBeGreaterThanOrEqual(4.5);
        }
      },
    );

    it.each(Object.entries(palette))(
      "%s: the highlight reads as a graphic (3:1) and carries its label (4.5:1)",
      (_id, tone) => {
        expect(contrastRatio(tone.highlight, tone.bg)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(tone.highlight, tone.panel)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(tone.onHighlight, tone.highlight)).toBeGreaterThanOrEqual(4.5);
      },
    );
  });
});
