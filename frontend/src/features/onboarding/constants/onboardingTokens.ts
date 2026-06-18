import { colors, spacing } from "@/constants";

/** Cream mat behind illustrations — Stitch postcard inner frame. */
export const ONBOARDING_ILLUSTRATION_BG = colors.onboardingIllustrationBg;

/**
 * Illustration aspect ratio (width ÷ height).
 * Mobile portrait 3:4 — taller than wide, matches generated assets.
 */
export const ONBOARDING_ILLUSTRATION_ASPECT = 3 / 4;

/** Horizontal gutter between carousel edge and postcard. */
export const ONBOARDING_POSTCARD_PAGE_GUTTER = spacing.sm;

/** Inner padding around postcard content. */
export const ONBOARDING_POSTCARD_BODY_PADDING = spacing.lg;

/** Padding inside the illustration outer frame (mat). */
export const ONBOARDING_POSTCARD_FRAME_INSET = spacing.sm;

/** Gap between illustration frame and copy block. */
export const ONBOARDING_POSTCARD_IMAGE_COPY_GAP = spacing.md;

/** Fixed copy block height so every postcard is the same size. */
export const ONBOARDING_POSTCARD_COPY_HEIGHT = 96;

/**
 * Space reserved below the postcard card so iOS/Android shadows do not
 * bleed into the dot pager.
 */
export const ONBOARDING_POSTCARD_SHADOW_CLEARANCE = spacing.lg;

/** Gap between shadow clearance and dot pager (Stitch 8px). */
export const ONBOARDING_DOT_PAGER_GAP = spacing.sm;

/** Gap between dot pager and Google CTA block. */
export const ONBOARDING_CTA_TOP_GAP = spacing.lg;

export interface AuthPostcardLayout {
  postcardWidth: number;
  postcardHeight: number;
  pageHeight: number;
  innerWidth: number;
  imageWidth: number;
  imageHeight: number;
  imageFrameHeight: number;
  copySectionHeight: number;
}

export function getAuthPostcardLayout(pageWidth: number): AuthPostcardLayout {
  const postcardWidth = pageWidth - ONBOARDING_POSTCARD_PAGE_GUTTER * 2;
  const innerWidth = postcardWidth - ONBOARDING_POSTCARD_BODY_PADDING * 2;
  const imageWidth = innerWidth - ONBOARDING_POSTCARD_FRAME_INSET * 2;
  const imageHeight = Math.round(imageWidth / ONBOARDING_ILLUSTRATION_ASPECT);
  const imageFrameHeight = imageHeight + ONBOARDING_POSTCARD_FRAME_INSET * 2;
  const postcardHeight =
    ONBOARDING_POSTCARD_BODY_PADDING * 2 +
    imageFrameHeight +
    ONBOARDING_POSTCARD_IMAGE_COPY_GAP +
    ONBOARDING_POSTCARD_COPY_HEIGHT;
  const pageHeight = postcardHeight + ONBOARDING_POSTCARD_SHADOW_CLEARANCE;

  return {
    postcardWidth,
    postcardHeight,
    pageHeight,
    innerWidth,
    imageWidth,
    imageHeight,
    imageFrameHeight,
    copySectionHeight: ONBOARDING_POSTCARD_COPY_HEIGHT,
  };
}
