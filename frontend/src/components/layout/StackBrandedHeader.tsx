import { HeaderBackButton, getHeaderTitle } from "@react-navigation/elements";
import type { NativeStackHeaderProps } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing, typography } from "@/constants";

import { HeaderGradientFill } from "./HeaderGradientFill";

export function StackBrandedHeader({
  options,
  route,
  back,
  navigation,
}: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  const title = getHeaderTitle(options, route.name);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.gradientShell,
          {
            borderBottomLeftRadius: spacing.headerCurveRadius,
            borderBottomRightRadius: spacing.headerCurveRadius,
          },
        ]}
      >
        <HeaderGradientFill />

        <View
          style={[
            styles.gradientInner,
            { paddingTop: insets.top + spacing.lg },
          ]}
        >
          <View style={styles.row}>
            {back ? (
              <HeaderBackButton
                tintColor={colors.textOnPrimary}
                displayMode="minimal"
                onPress={navigation.goBack}
                pressColor="transparent"
                pressOpacity={1}
                style={styles.backButton}
              />
            ) : null}
            <Text
              style={styles.title}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {title}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
  },
  gradientShell: {
    width: "100%",
    overflow: "hidden",
  },
  gradientInner: {
    width: "100%",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
  },
  backButton: {
    marginStart: -6,
  },
  title: {
    flex: 1,
    marginStart: spacing.sm,
    ...typography.headerUsernameLine,
  },
});
