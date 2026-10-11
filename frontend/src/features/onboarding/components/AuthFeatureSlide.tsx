import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { inkSoft, paper, spacing, typography } from "@/constants";

import type { AuthFeatureSlideData } from "../constants/authFeatureSlides";
import type { WelcomeTourSlideLayout } from "../constants/onboardingTokens";
import {
  ONBOARDING_DESCRIPTION_MAX_WIDTH,
  ONBOARDING_IMAGE_COPY_GAP,
} from "../constants/onboardingTokens";

export interface AuthFeatureSlideProps {
  slide: AuthFeatureSlideData;
  layout: WelcomeTourSlideLayout;
}

export function AuthFeatureSlide({ slide, layout }: AuthFeatureSlideProps) {
  const { illustrationWidth, illustrationHeight } = layout;

  return (
    <View
      style={styles.content}
      accessibilityRole="summary"
      accessibilityLabel={slide.description}
    >
      <View style={styles.imageWrap}>
        <Image
          source={slide.image}
          style={{
            width: illustrationWidth,
            height: illustrationHeight,
            backgroundColor: paper,
          }}
          contentFit="contain"
          contentPosition="center"
          accessibilityIgnoresInvertColors
        />
      </View>

      <Text
        style={[
          styles.description,
          {
            marginTop: ONBOARDING_IMAGE_COPY_GAP,
            maxWidth: ONBOARDING_DESCRIPTION_MAX_WIDTH,
          },
        ]}
      >
        {slide.description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  imageWrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  description: {
    ...typography.bodyMd,
    color: inkSoft,
    textAlign: "center",
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
  },
});
