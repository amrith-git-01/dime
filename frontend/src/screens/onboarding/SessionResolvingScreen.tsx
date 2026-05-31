import { ActivityIndicator, StyleSheet, View } from "react-native";

import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { colors } from "@/constants";

/** Neutral hold screen while `/me` resolves (cold start with saved session). */
export default function SessionResolvingScreen() {
  return (
    <ScreenContainer style={styles.root}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
