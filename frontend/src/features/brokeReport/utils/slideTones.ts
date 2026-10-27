import type { ReportToneId } from "@/constants/reportPalette";

import type { ReportSlideId } from "../types";

/** Each slide's tone in the theme's report palette: the order is a rainbow, the closing is ink. */
export const SLIDE_TONE: Readonly<Record<ReportSlideId, ReportToneId>> = {
  cover: "iris",
  damage: "coral",
  lineup: "grape",
  regular: "sky",
  moment: "sun",
  rhythm: "mint",
  win: "lime",
  closing: "ink",
};
