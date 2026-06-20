import { Image } from "expo-image";
import { Platform, StyleSheet, Text, View } from "react-native";

import { bento, colors, radius, shadows, spacing, surfaces } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import type { AuthFeatureSlideData } from "../constants/authFeatureSlides";
import type { AuthPostcardLayout } from "../constants/onboardingTokens";
import {
  ONBOARDING_ILLUSTRATION_BG,
  ONBOARDING_POSTCARD_BODY_PADDING,
  ONBOARDING_POSTCARD_FRAME_INSET,
  ONBOARDING_POSTCARD_IMAGE_COPY_GAP,
  ONBOARDING_POSTCARD_SHADOW_CLEARANCE,
} from "../constants/onboardingTokens";

export interface AuthFeatureSlideProps {
  slide: AuthFeatureSlideData;
  /** Width of the horizontal pager page (carousel viewport). */
  pageWidth: number;
  layout: AuthPostcardLayout;
}

export function AuthFeatureSlide({
  slide,
  pageWidth,
  layout,
}: AuthFeatureSlideProps) {
  const subtext = slide.subtext;

  const {
    postcardWidth,
    postcardHeight,
    pageHeight,
    innerWidth,
    imageWidth,
    imageHeight,
    copySectionHeight,
  } = layout;

  return (
    <View style={[styles.page, { width: pageWidth, height: pageHeight }]}>
      <View
        style={[
          styles.postcard,
          { width: postcardWidth, height: postcardHeight },
          shadows.postcard,
        ]}
        accessibilityRole="summary"
        accessibilityLabel={`${slide.headline}. ${subtext}`}
      >
        <View style={styles.body}>
          <View
            style={[
              styles.imageFrameOuter,
              {
                width: innerWidth,
                height: imageHeight + ONBOARDING_POSTCARD_FRAME_INSET * 2,
                padding: ONBOARDING_POSTCARD_FRAME_INSET,
              },
            ]}
          >
            <View
              style={[
                styles.imageMat,
                {
                  width: imageWidth,
                  height: imageHeight,
                  backgroundColor: ONBOARDING_ILLUSTRATION_BG,
                },
              ]}
            >
              <Image
                source={slide.image}
                style={styles.image}
                contentFit="contain"
                accessibilityIgnoresInvertColors
              />
            </View>
          </View>

          <View
            style={[
              styles.copySection,
              {
                height: copySectionHeight,
                marginTop: ONBOARDING_POSTCARD_IMAGE_COPY_GAP,
              },
            ]}
          >
            <Text style={styles.headline} numberOfLines={1}>
              {slide.headline}
            </Text>
            <Text style={styles.subtext} numberOfLines={3}>
              {subtext}
            </Text>
          </View>
        </View>
      </View>
      <View
        style={{ height: ONBOARDING_POSTCARD_SHADOW_CLEARANCE }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: "center",
  },
  postcard: {
    backgroundColor: bento.twoToneBodySurface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: Platform.OS === "android" ? "hidden" : "visible",
  },
  body: {
    flex: 1,
    padding: ONBOARDING_POSTCARD_BODY_PADDING,
    alignItems: "center",
  },
  imageFrameOuter: {
    alignSelf: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: surfaces.primaryBorder28,
    backgroundColor: bento.sectionSurface,
  },
  imageMat: {
    alignSelf: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  copySection: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  headline: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.brandPrimary,
    textAlign: "center",
  },
  subtext: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textListSecondary,
    textAlign: "center",
  },
});
