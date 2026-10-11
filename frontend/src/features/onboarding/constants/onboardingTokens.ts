import { spacing } from "@/constants";

/** Portrait illustration aspect — width ÷ height (matches 1086×1448 assets, 3:4). */
export const ONBOARDING_ILLUSTRATION_ASPECT = 3 / 4;

/** Horizontal gutter inside each carousel page. */
export const ONBOARDING_PAGE_GUTTER = spacing.lg;

/** Gap between illustration and description copy. */
export const ONBOARDING_IMAGE_COPY_GAP = spacing.md;

/** Max width for description text block. */
export const ONBOARDING_DESCRIPTION_MAX_WIDTH = 320;

/** Cap hero height so copy + CTA fit on small phones. */
export const ONBOARDING_ILLUSTRATION_MAX_HEIGHT = 480;

export interface WelcomeTourSlideLayout {
  illustrationWidth: number;
  illustrationHeight: number;
}

export function getWelcomeTourSlideLayout(
  pageWidth: number,
): WelcomeTourSlideLayout {
  const contentWidth = pageWidth - ONBOARDING_PAGE_GUTTER * 2;
  let illustrationWidth = Math.min(contentWidth, 360);
  let illustrationHeight = illustrationWidth / ONBOARDING_ILLUSTRATION_ASPECT;

  if (illustrationHeight > ONBOARDING_ILLUSTRATION_MAX_HEIGHT) {
    illustrationHeight = ONBOARDING_ILLUSTRATION_MAX_HEIGHT;
    illustrationWidth = illustrationHeight * ONBOARDING_ILLUSTRATION_ASPECT;
  }

  return {
    illustrationWidth,
    illustrationHeight,
  };
}
