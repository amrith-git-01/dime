import { StyleSheet, Text } from "react-native";

import { colors } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

export function BentoOptionalHint() {
  return <Text style={styles.optionalHint}>(optional)</Text>;
}

const styles = StyleSheet.create({
  optionalHint: {
    fontFamily: fontFamilies.regular,
    color: colors.inactive,
    fontSize: 12,
  },
});
