import LottieView from "lottie-react-native";
import { memo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import authHero from "@/assets/lottie/auth-hero.json";
import { spacing } from "@/constants";

const MAX_HERO_SIZE = 400;

export const AuthHeroLottie = memo(function AuthHeroLottie() {
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

const styles = StyleSheet.create({
  clip: {
    alignSelf: "center",
    overflow: "hidden",
  },
});
