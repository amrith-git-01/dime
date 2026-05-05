import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";

export type AuthMode = "login" | "register";

type Props = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  children: React.ReactNode;
};

export function AuthScreenLayout({ mode, onModeChange, children }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const minScrollContentHeight = windowHeight - insets.top;

  return (
    <ScreenContainer>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { minHeight: minScrollContentHeight },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
      >
        <Pressable
          accessibilityRole="none"
          style={styles.dismissPressable}
          onPress={Keyboard.dismiss}
        >
          <View style={styles.page}>
            <Text style={styles.logo}>Dime</Text>
            <View style={styles.segment}>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === "login" }}
                onPress={() => onModeChange("login")}
                style={styles.segmentPressable}
              >
                <Text
                  style={[
                    styles.segmentText,
                    mode === "login" && styles.segmentActive,
                  ]}
                >
                  Sign in
                </Text>
                {mode === "login" ? (
                  <View style={styles.segmentUnderline} />
                ) : null}
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === "register" }}
                onPress={() => onModeChange("register")}
                style={styles.segmentPressable}
              >
                <Text
                  style={[
                    styles.segmentText,
                    mode === "register" && styles.segmentActive,
                  ]}
                >
                  Create account
                </Text>
                {mode === "register" ? (
                  <View style={styles.segmentUnderline} />
                ) : null}
              </Pressable>
            </View>
            <View style={styles.slideShell}>{children}</View>
          </View>
        </Pressable>
      </KeyboardAwareScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  dismissPressable: {
    flexGrow: 1,
    width: "100%",
    justifyContent: "center",
  },
  page: {
    width: "100%",
  },
  logo: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.24,
    color: colors.primary,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  segment: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: spacing.lg,
    gap: spacing.xl,
  },
  segmentPressable: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    minWidth: 120,
  },
  segmentText: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.inactive,
  },
  segmentActive: {
    color: colors.primary,
  },
  segmentUnderline: {
    marginTop: spacing.sm,
    height: 2,
    width: "100%",
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  /** Clips sliding form card (below logo + tabs). */
  slideShell: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 16,
  },
});
