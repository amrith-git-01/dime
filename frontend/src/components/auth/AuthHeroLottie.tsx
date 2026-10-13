import LottieView from "lottie-react-native";
import { memo } from "react";
import { useWindowDimensions, View } from "react-native";

import authHero from "@/assets/lottie/auth-hero.json";
import { radius, spacing } from "@/constants";
import { createThemedStyles } from "@/theme";

const MAX_HERO_SIZE = 400;

export const AuthHeroLottie = memo(function AuthHeroLottie() {
  const styles = useStyles();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const size = Math.min(
    windowWidth - spacing.lg * 2,
    windowHeight * 0.42,
    MAX_HERO_SIZE,
  );

  return (
    <View style={[styles.clip, { width: size, height: size }]}>
      <LottieView
        source={authHero}
        autoPlay
        loop
        style={{ width: size, height: size }}
      />
    </View>
  );
});

/**
 * The illustration is drawn in dark ink strokes, so in dark mode it sits on a light panel
 * (`illustrationPanel`; transparent in light).
 */
const useStyles = createThemedStyles(({ colors }) => ({
  clip: {
    alignSelf: "center",
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: colors.illustrationPanel,
  },
}));
